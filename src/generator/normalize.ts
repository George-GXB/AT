export interface Sentence {
  text: string
  /** 由来となった行の位置。ルール側で行単位の判定にも使う */
  lineIndex: number
}

export interface NormalizedText {
  /** 文の解析用。OCR が入れた余計な空白を詰めた行 */
  lines: string[]
  /** 用語抽出用。空白を語の区切りとして残した行 */
  rawLines: string[]
  sentences: Sentence[]
}

const ZERO_WIDTH = /[​-‍﻿]/g
/** OCR が日本語の文字間に入れてしまう半角スペースを潰す */
const JP = '\u3040-\u30FF\u3400-\u9FFF\uFF00-\uFFEF\u3000-\u303F'
const SPACE_BETWEEN_JP = new RegExp(`([0-9${JP}])[ \t]+(?=[${JP}])`, 'g')

/** 行頭の箇条書き記号。用語抽出の手がかりになるので位置だけ覚えて取り除く */
const BULLET = /^\s*(?:[・･\-–—*+>＞●○■□◆◇▲△▼▽※☆★]|\d{1,2}[.)]|[(（]\d{1,2}[)）])\s*/

export function normalizeLine(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/[～〜]/g, '〜')
    .replace(/[｜|]/g, '|')
    .replace(/[ \t ]+/g, ' ')
    .trim()
}

/**
 * OCR が日本語の途中に入れてしまう空白を詰める。
 * 見出しや表のセルまで繋がってしまうため、用語抽出の前には使わない。
 */
export function collapseInnerSpaces(line: string): string {
  return line.replace(SPACE_BETWEEN_JP, '$1')
}

export function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim()
}

/** 文末記号か改行で文を切り出す */
export function splitSentences(line: string, lineIndex: number): Sentence[] {
  return line
    .split(/(?<=[。．！？!?])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => ({ text, lineIndex }))
}

export function normalizeText(raw: string): NormalizedText {
  const rawLines = raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length > 0)
  const lines = rawLines.map(collapseInnerSpaces)

  const sentences: Sentence[] = []
  lines.forEach((line, i) => {
    sentences.push(...splitSentences(stripBullet(line), i))
  })

  return { lines, rawLines, sentences }
}

/** 文末の句読点を落とす */
export function trimTerminator(s: string): string {
  return s.replace(/[。．！？!?、,]+$/, '').trim()
}

const TRAILING_PARTICLE = /(?:は|が|を|に|へ|と|で|も|の|や|から|まで|より|という|といった)$/

/**
 * 用語として妥当か。助詞で終わる・記号を含む・長すぎる語は
 * 選択肢にすると不自然になるため弾く。
 */
export function isPlausibleTerm(term: string): boolean {
  const t = term.trim()
  if (t.length < 2 || t.length > 24) return false
  if (/[。．、，！？!?:：;；「」『』（）()\[\]{}]/.test(t)) return false
  if (/^[0-9\s]+$/.test(t)) return false
  if (TRAILING_PARTICLE.test(t)) return false
  return true
}

const KANJI_RUN = /[㐀-鿿]{2,}/g
const KATAKANA_RUN = /[ァ-ヴー]{3,}/g
const LATIN_RUN = /[A-Za-z][A-Za-z'\-]{2,}/g

/** 文書全体から「用語らしい語」を集める。誤答プールの母集団になる。 */
export function extractKeywords(text: NormalizedText): string[] {
  const counts = new Map<string, number>()
  const add = (w: string) => {
    if (!isPlausibleTerm(w)) return
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }

  for (const line of text.rawLines) {
    for (const segment of stripBullet(line).split(/\s+/)) {
      if (!segment) continue
      for (const re of [KANJI_RUN, KATAKANA_RUN, LATIN_RUN]) {
        re.lastIndex = 0
        for (const m of segment.matchAll(re)) add(m[0])
      }
      // 括弧の中身は用語であることが多い
      for (const m of segment.matchAll(/[（(「『]([^）)」』]{2,20})[）)」』]/g)) add(m[1])
    }
  }

  return [...counts.keys()]
}

/** 語の出現回数。穴埋めの重要語選定に使う */
export function countOccurrences(text: NormalizedText, word: string): number {
  let n = 0
  for (const line of text.lines) {
    let from = 0
    for (;;) {
      const i = line.indexOf(word, from)
      if (i < 0) break
      n++
      from = i + word.length
    }
  }
  return n
}
