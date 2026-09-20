import { db } from './schema'
import type { Deck, Question } from '../types'

/** 保存データ全体の上限: 1GB */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024
/** この割合を超えたら警告バナーを出す */
export const WARN_RATIO = 0.9

const encoder = new TextEncoder()

/** 問題集1件の概算バイト数(JSON換算) */
export function estimateBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length
}

export interface UsageInfo {
  /** アプリが保存した問題集の合計バイト数 */
  appBytes: number
  limitBytes: number
  ratio: number
  overLimit: boolean
  nearLimit: boolean
  /** ブラウザが報告する実使用量(取得できない場合は undefined) */
  browserUsage?: number
  browserQuota?: number
  persisted?: boolean
}

export async function getUsage(): Promise<UsageInfo> {
  const decks = await db.decks.toArray()
  const appBytes = decks.reduce((sum, d) => sum + (d.bytes ?? 0), 0)

  let browserUsage: number | undefined
  let browserQuota: number | undefined
  let persisted: boolean | undefined
  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      const est = await navigator.storage.estimate()
      browserUsage = est.usage
      browserQuota = est.quota
    } catch {
      /* 取得できない環境では表示を省く */
    }
    try {
      persisted = await navigator.storage.persisted?.()
    } catch {
      /* 同上 */
    }
  }

  const ratio = appBytes / STORAGE_LIMIT_BYTES
  return {
    appBytes,
    limitBytes: STORAGE_LIMIT_BYTES,
    ratio,
    overLimit: appBytes >= STORAGE_LIMIT_BYTES,
    nearLimit: ratio >= WARN_RATIO,
    browserUsage,
    browserQuota,
    persisted,
  }
}

/**
 * iOS Safari は使われていないサイトのデータを退避することがある。
 * 起動時に永続化を要求しておく(拒否されても動作には影響しない)。
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* 非対応環境では何もしない */
  }
  return false
}

export class StorageLimitError extends Error {
  constructor(public readonly needed: number, public readonly available: number) {
    super('保存容量の上限(1GB)に達しているため保存できません。')
    this.name = 'StorageLimitError'
  }
}

/** 追加分を保存しても 1GB を超えないか検査する */
async function assertFits(additionalBytes: number, replacingBytes = 0): Promise<void> {
  const { appBytes } = await getUsage()
  const after = appBytes - replacingBytes + additionalBytes
  if (after > STORAGE_LIMIT_BYTES) {
    throw new StorageLimitError(after - STORAGE_LIMIT_BYTES, STORAGE_LIMIT_BYTES - appBytes)
  }
}

export async function createDeck(name: string, questions: Question[]): Promise<number> {
  const now = Date.now()
  const deck: Deck = { name, questions, createdAt: now, updatedAt: now, bytes: 0 }
  deck.bytes = estimateBytes(deck)
  await assertFits(deck.bytes)
  return db.decks.add(deck)
}

export async function appendToDeck(deckId: number, questions: Question[]): Promise<void> {
  const deck = await db.decks.get(deckId)
  if (!deck) throw new Error('問題集が見つかりません。')
  const before = deck.bytes
  const merged: Deck = {
    ...deck,
    questions: [...deck.questions, ...questions],
    updatedAt: Date.now(),
    bytes: 0,
  }
  merged.bytes = estimateBytes(merged)
  await assertFits(merged.bytes, before)
  await db.decks.put(merged)
}

export async function saveDeck(deck: Deck): Promise<void> {
  const before = deck.id ? ((await db.decks.get(deck.id))?.bytes ?? 0) : 0
  const next: Deck = { ...deck, updatedAt: Date.now(), bytes: 0 }
  next.bytes = estimateBytes(next)
  await assertFits(next.bytes, before)
  await db.decks.put(next)
}

/** 採点結果だけを記録する。容量はほぼ変わらないため上限検査は行わない。 */
export async function recordResult(deckId: number, score: number): Promise<void> {
  await db.decks.update(deckId, { lastPlayedAt: Date.now(), lastScore: score })
}

export async function deleteDeck(deckId: number): Promise<void> {
  await db.decks.delete(deckId)
}

export async function deleteAll(): Promise<void> {
  await db.decks.clear()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
