import { db } from './schema'
import type { Deck } from '../types'
import { estimateBytes, STORAGE_LIMIT_BYTES, StorageLimitError, getUsage } from './storage'

const FORMAT = 'at-quiz-backup'
const FORMAT_VERSION = 1

interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  decks: Omit<Deck, 'id'>[]
}

export async function exportBackup(): Promise<{ filename: string; blob: Blob }> {
  const decks = await db.decks.toArray()
  const payload: BackupFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    decks: decks.map(({ id: _id, ...rest }) => rest),
  }
  const stamp = new Date().toISOString().slice(0, 10)
  return {
    filename: `一問一答バックアップ_${stamp}.json`,
    blob: new Blob([JSON.stringify(payload)], { type: 'application/json' }),
  }
}

/**
 * iOS の standalone PWA では <a download> が無視されることがあるため、
 * 共有シート(ファイルへ保存)を優先し、使えない場合のみダウンロードに落とす。
 */
export async function shareOrDownloadBackup(): Promise<'shared' | 'downloaded'> {
  const { filename, blob } = await exportBackup()
  const file = new File([blob], filename, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      // ユーザーが共有シートを閉じた場合は何もしない
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
      // 共有に失敗したらダウンロードへフォールバック
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export interface ImportResult {
  added: number
  skipped: number
}

/** バックアップを読み込む。既存データは消さず、同名の問題集は別名で追加する。 */
export async function importBackup(file: File): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('ファイルを読み取れませんでした。JSON 形式のバックアップを選んでください。')
  }

  const data = parsed as Partial<BackupFile>
  if (data?.format !== FORMAT || !Array.isArray(data.decks)) {
    throw new Error('このアプリのバックアップファイルではありません。')
  }

  const existingNames = new Set((await db.decks.toArray()).map((d) => d.name))
  let { appBytes } = await getUsage()
  let added = 0
  let skipped = 0

  for (const raw of data.decks) {
    if (!raw || !Array.isArray(raw.questions)) {
      skipped++
      continue
    }
    let name = raw.name?.trim() || '無題の問題集'
    if (existingNames.has(name)) {
      let n = 2
      while (existingNames.has(`${name} (${n})`)) n++
      name = `${name} (${n})`
    }

    const now = Date.now()
    const deck: Deck = {
      name,
      questions: raw.questions,
      createdAt: raw.createdAt ?? now,
      updatedAt: now,
      bytes: 0,
      lastPlayedAt: raw.lastPlayedAt,
      lastScore: raw.lastScore,
    }
    deck.bytes = estimateBytes(deck)

    if (appBytes + deck.bytes > STORAGE_LIMIT_BYTES) {
      throw new StorageLimitError(
        appBytes + deck.bytes - STORAGE_LIMIT_BYTES,
        STORAGE_LIMIT_BYTES - appBytes,
      )
    }

    await db.decks.add(deck)
    appBytes += deck.bytes
    existingNames.add(name)
    added++
  }

  return { added, skipped }
}
