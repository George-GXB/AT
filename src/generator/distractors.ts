export type Rng = () => number

export const DISTRACTOR_COUNT = 3

interface Profile {
  kanji: number
  kana: number
  latin: number
  digit: number
  other: number
}

function profile(s: string): Profile {
  const p: Profile = { kanji: 0, kana: 0, latin: 0, digit: 0, other: 0 }
  for (const ch of s) {
    if (/[㐀-鿿]/.test(ch)) p.kanji++
    else if (/[぀-ヿー]/.test(ch)) p.kana++
    else if (/[A-Za-z]/.test(ch)) p.latin++
    else if (/[0-9]/.test(ch)) p.digit++
    else p.other++
  }
  const total = [...s].length || 1
  return {
    kanji: p.kanji / total,
    kana: p.kana / total,
    latin: p.latin / total,
    digit: p.digit / total,
    other: p.other / total,
  }
}

/** 文字種の構成がどれだけ近いか(1 に近いほど似ている) */
function profileSimilarity(a: string, b: string): number {
  const pa = profile(a)
  const pb = profile(b)
  const diff =
    Math.abs(pa.kanji - pb.kanji) +
    Math.abs(pa.kana - pb.kana) +
    Math.abs(pa.latin - pb.latin) +
    Math.abs(pa.digit - pb.digit) +
    Math.abs(pa.other - pb.other)
  return 1 - diff / 2
}

/** 長さがどれだけ近いか(1 に近いほど似ている) */
function lengthSimilarity(a: string, b: string): number {
  const la = [...a].length
  const lb = [...b].length
  return Math.min(la, lb) / Math.max(la, lb, 1)
}

export function similarity(a: string, b: string): number {
  return 0.6 * profileSimilarity(a, b) + 0.4 * lengthSimilarity(a, b)
}

/** 選択肢として同一視すべきか(表記ゆれ・包含関係を弾く) */
function conflicts(a: string, b: string): boolean {
  const na = a.normalize('NFKC').replace(/\s/g, '')
  const nb = b.normalize('NFKC').replace(/\s/g, '')
  if (na === nb) return true
  // 「応仁の乱」と「応仁」のように一方が他方を含むと答えが曖昧になる
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return true
  return false
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 正解に紛らわしい誤答を同一資料内の語から選ぶ。
 * 文字種と長さが近いものを優先し、上位から少しだけ揺らして選ぶ。
 * 必要数に満たない場合は null を返す(不自然な4択を作らない)。
 */
export function pickDistractors(
  correct: string,
  pool: readonly string[],
  count: number = DISTRACTOR_COUNT,
  rng: Rng = Math.random,
): string[] | null {
  const seen = new Set<string>()
  const candidates: string[] = []

  for (const raw of pool) {
    const c = raw.trim()
    if (!c || conflicts(c, correct)) continue
    const key = c.normalize('NFKC').replace(/\s/g, '')
    if (seen.has(key)) continue
    if (candidates.some((existing) => conflicts(existing, c))) continue
    seen.add(key)
    candidates.push(c)
  }

  if (candidates.length < count) return null

  candidates.sort((a, b) => similarity(correct, b) - similarity(correct, a))
  const windowSize = Math.min(candidates.length, Math.max(count, count * 3))
  return shuffle(candidates.slice(0, windowSize), rng).slice(0, count)
}

/** 正解と誤答をまとめてシャッフルし、正解位置を返す */
export function buildChoices(
  correct: string,
  distractors: readonly string[],
  rng: Rng = Math.random,
): { choices: string[]; answerIndex: number } {
  const choices = shuffle([correct, ...distractors], rng)
  return { choices, answerIndex: choices.indexOf(correct) }
}
