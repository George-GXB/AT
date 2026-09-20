import { countOccurrences } from '../normalize'
import type { DraftQuestion, RuleContext } from './types'
import { BLANK } from './numeric'

/** これより短い文は空欄にすると文脈が足りない */
const MIN_SENTENCE_LENGTH = 14

/**
 * どのルールにも当てはまらなかった文を穴埋めにする汎用フォールバック。
 * 文中で最も特徴的な語(長く、資料内で繰り返し出てくる語)を空欄にする。
 */
export function clozeRule(ctx: RuleContext): DraftQuestion[] {
  const questions: DraftQuestion[] = []

  for (const sentence of ctx.text.sentences) {
    if (ctx.consumed.has(sentence.text)) continue
    if ([...sentence.text].length < MIN_SENTENCE_LENGTH) continue

    const inSentence = ctx.keywords.filter((k) => sentence.text.includes(k))
    if (inSentence.length === 0) continue

    // 長い語を優先し、同じ長さなら資料内で繰り返される語(＝重要語)を選ぶ
    const target = inSentence.reduce((best, k) => {
      const score = [...k].length * 10 + Math.min(countOccurrences(ctx.text, k), 5)
      const bestScore = [...best].length * 10 + Math.min(countOccurrences(ctx.text, best), 5)
      return score > bestScore ? k : best
    })

    const masked = sentence.text.split(target).join(BLANK)
    if (masked.split(BLANK).join('').length < 8) continue

    questions.push({
      prompt: `次の文の空欄にあてはまる語句は？\n${masked}`,
      answer: target,
      distractorPools: [ctx.keywords],
      sourceSentence: sentence.text,
      rule: 'cloze',
      confidence: 0.55,
    })
    ctx.consumed.add(sentence.text)
  }

  return questions
}
