import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema'
import {
  appendToDeck,
  createDeck,
  deleteDeck,
  estimateBytes,
  formatBytes,
  getUsage,
  recordResult,
  StorageLimitError,
  STORAGE_LIMIT_BYTES,
} from './storage'
import { exportBackup, importBackup } from './backup'
import type { Question } from '../types'

function question(id: string): Question {
  return {
    id,
    prompt: `問題 ${id}`,
    choices: ['あ', 'い', 'う', 'え'],
    answerIndex: 1,
    sourceSentence: `出典 ${id}`,
    rule: 'definition',
    confidence: 0.8,
  }
}

const questions = (n: number) => Array.from({ length: n }, (_, i) => question(`q${i}`))

beforeEach(async () => {
  await db.decks.clear()
})

describe('問題集の保存', () => {
  it('作成した問題集がバイト数つきで保存される', async () => {
    const id = await createDeck('理科', questions(3))
    const deck = await db.decks.get(id)
    expect(deck?.questions).toHaveLength(3)
    expect(deck?.bytes).toBeGreaterThan(0)
  })

  it('既存の問題集に追記できる', async () => {
    const id = await createDeck('理科', questions(2))
    const before = (await db.decks.get(id))!.bytes
    await appendToDeck(id, [question('extra')])
    const after = await db.decks.get(id)
    expect(after!.questions).toHaveLength(3)
    expect(after!.bytes).toBeGreaterThan(before)
  })

  it('採点結果を記録する', async () => {
    const id = await createDeck('理科', questions(2))
    await recordResult(id, 0.5)
    const deck = await db.decks.get(id)
    expect(deck?.lastScore).toBe(0.5)
    expect(deck?.lastPlayedAt).toBeTypeOf('number')
  })
})

describe('1GB の上限', () => {
  it('使用量は保存済みの問題集の合計になる', async () => {
    const a = await createDeck('A', questions(2))
    const b = await createDeck('B', questions(5))
    const usage = await getUsage()
    const decks = await db.decks.bulkGet([a, b])
    expect(usage.appBytes).toBe(decks.reduce((s, d) => s + d!.bytes, 0))
    expect(usage.limitBytes).toBe(1024 * 1024 * 1024)
    expect(usage.nearLimit).toBe(false)
    expect(usage.overLimit).toBe(false)
  })

  it('上限に近づくと警告、超えると超過として報告する', async () => {
    const deck = { name: '大量', questions: [], createdAt: 0, updatedAt: 0, bytes: 0 }
    await db.decks.add({ ...deck, bytes: Math.round(STORAGE_LIMIT_BYTES * 0.95) })
    expect((await getUsage()).nearLimit).toBe(true)
    expect((await getUsage()).overLimit).toBe(false)

    await db.decks.add({ ...deck, name: 'さらに', bytes: Math.round(STORAGE_LIMIT_BYTES * 0.1) })
    expect((await getUsage()).overLimit).toBe(true)
  })

  it('上限を超える保存は StorageLimitError で拒否され、データは増えない', async () => {
    await db.decks.add({
      name: 'ほぼ満杯',
      questions: [],
      createdAt: 0,
      updatedAt: 0,
      bytes: STORAGE_LIMIT_BYTES - 100,
    })

    await expect(createDeck('あふれる', questions(10))).rejects.toBeInstanceOf(StorageLimitError)
    expect(await db.decks.count()).toBe(1)
  })

  it('追記も上限を超えると拒否され、元の問題集は変わらない', async () => {
    const id = await createDeck('理科', questions(2))
    await db.decks.add({
      name: '占有',
      questions: [],
      createdAt: 0,
      updatedAt: 0,
      bytes: STORAGE_LIMIT_BYTES - 200,
    })

    await expect(appendToDeck(id, questions(20))).rejects.toBeInstanceOf(StorageLimitError)
    expect((await db.decks.get(id))!.questions).toHaveLength(2)
  })

  it('削除すると使用量が戻る', async () => {
    const id = await createDeck('理科', questions(3))
    expect((await getUsage()).appBytes).toBeGreaterThan(0)
    await deleteDeck(id)
    expect((await getUsage()).appBytes).toBe(0)
  })

  it('ブラウザの実測値が取れる環境ではあわせて報告する', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 1234, quota: 5678 }),
        persisted: async () => true,
      },
    })
    const usage = await getUsage()
    expect(usage.browserUsage).toBe(1234)
    expect(usage.persisted).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('バックアップ', () => {
  it('書き出したファイルを読み込むと問題集が復元される', async () => {
    await createDeck('理科', questions(3))
    await createDeck('社会', questions(2))
    const { blob, filename } = await exportBackup()
    expect(filename).toMatch(/\.json$/)

    await db.decks.clear()
    const file = new File([await blob.text()], filename, { type: 'application/json' })
    const result = await importBackup(file)

    expect(result.added).toBe(2)
    const restored = await db.decks.orderBy('name').toArray()
    expect(restored.map((d) => d.name)).toEqual(['理科', '社会'].sort())
    expect(restored.flatMap((d) => d.questions)).toHaveLength(5)
  })

  it('同名の問題集は上書きせず別名で追加する', async () => {
    await createDeck('理科', questions(1))
    const { blob, filename } = await exportBackup()
    const file = new File([await blob.text()], filename, { type: 'application/json' })

    await importBackup(file)
    const names = (await db.decks.toArray()).map((d) => d.name)
    expect(names).toContain('理科')
    expect(names).toContain('理科 (2)')
  })

  it('別形式の JSON は読み込まない', async () => {
    const file = new File([JSON.stringify({ hello: 'world' })], 'x.json')
    await expect(importBackup(file)).rejects.toThrow('バックアップファイルではありません')
  })

  it('壊れたファイルはエラーになる', async () => {
    const file = new File(['{{{'], 'x.json')
    await expect(importBackup(file)).rejects.toThrow('読み取れませんでした')
  })
})

describe('表示の補助', () => {
  it('バイト数を読みやすい単位にする', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(STORAGE_LIMIT_BYTES)).toBe('1.00 GB')
  })

  it('バイト数の見積りは JSON の実サイズと一致する', () => {
    const value = { a: 'あいう', b: [1, 2, 3] }
    expect(estimateBytes(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length)
  })
})
