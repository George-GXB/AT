import { stripBullet, trimTerminator } from '../normalize'
import type { DraftQuestion, RuleContext } from './types'

// 「apple りんご」「apple : りんご」「apple - りんご」
const EN_FIRST = /^([A-Za-z][A-Za-z'’\- ]{0,29}?)\s*(?:[:：=＝|\-–—]|\s)\s*([぀-ヿ㐀-鿿][^A-Za-z]{0,39})$/
// 「りんご apple」
const JA_FIRST = /^([぀-ヿ㐀-鿿][^A-Za-z]{0,29}?)\s*(?:[:：=＝|\-–—]|\s)\s*([A-Za-z][A-Za-z'’\- ]{0,29})$/

/** 誤答を3つ揃えるために最低限必要なペア数 */
const MIN_PAIRS = 4

interface Pair {
  en: string
  ja: string
  source: string
}

function extractPairs(ctx: RuleContext): Pair[] {
  const pairs: Pair[] = []
  const seen = new Set<string>()

  for (const line of ctx.text.lines) {
    const body = stripBullet(line)
    if (ctx.consumed.has(body)) continue

    const m = EN_FIRST.exec(body) ?? JA_FIRST.exec(body)
    if (!m) continue

    const [en, ja] = EN_FIRST.test(body)
      ? [m[1], m[2]]
      : [m[2], m[1]]

    const enWord = en.trim()
    const jaWord = trimTerminator(ja)
    if (enWord.length < 2 || jaWord.length < 1) continue
    if (seen.has(enWord.toLowerCase())) continue

    seen.add(enWord.toLowerCase())
    pairs.push({ en: enWord, ja: jaWord, source: body })
  }

  return pairs
}

/** 英単語と訳の対応行から 英→日 / 日→英 の両方向の問題を作る */
export function vocabRule(ctx: RuleContext): DraftQuestion[] {
  const pairs = extractPairs(ctx)
  if (pairs.length < MIN_PAIRS) return []

  for (const p of pairs) ctx.consumed.add(p.source)

  const jaPool = pairs.map((p) => p.ja)
  const enPool = pairs.map((p) => p.en)
  const questions: DraftQuestion[] = []

  for (const { en, ja, source } of pairs) {
    questions.push({
      prompt: `「${en}」の意味は？`,
      answer: ja,
      distractorPools: [jaPool],
      sourceSentence: source,
      rule: 'vocab',
      confidence: 0.9,
    })
    questions.push({
      prompt: `「${ja}」を英語で書くと？`,
      answer: en,
      distractorPools: [enPool],
      sourceSentence: source,
      rule: 'vocab',
      confidence: 0.85,
    })
  }

  return questions
}
