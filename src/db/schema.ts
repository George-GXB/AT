import Dexie, { type Table } from 'dexie'
import type { Deck } from '../types'

/**
 * 端末内(IndexedDB)のみで完結する保存層。
 * 取り込んだ画像を保存するテーブルは意図的に存在しない
 * ―― 構造的に画像を永続化できないようにしてある。
 */
class QuizDB extends Dexie {
  decks!: Table<Deck, number>

  constructor() {
    super('at-quiz')
    this.version(1).stores({
      decks: '++id, name, updatedAt',
    })
  }
}

export const db = new QuizDB()
