import { isPlausibleTerm, trimTerminator } from '../normalize'
import type { DraftQuestion, RuleContext } from './types'

interface Pattern {
  re: RegExp
  confidence: number
}

const PATTERNS: Pattern[] = [
  // 「光合成とは、植物が光エネルギーを使って養分をつくる働きである。」
  { re: /^(.{2,24}?)とは[、,]?\s*(.{4,}?)(?:である|のことである|のことを?いう|のこと|をいう|を指す|です|だ)?[。．]?$/, confidence: 0.85 },
  // 「対流とは違い、伝導は…」のような文を拾わないよう「は、」は断定表現を必須にする
  { re: /^(.{2,24}?)は[、,]\s*(.{6,}?)(?:である|のことである|のことを?いう|をいう|を指す)[。．]?$/, confidence: 0.8 },
  // 「光合成 ＝ 植物が養分をつくる働き」
  { re: /^(.{2,24}?)\s*[＝=]\s*(.{4,})$/, confidence: 0.75 },
  // 「光合成：植物が養分をつくる働き」
  { re: /^(.{2,24}?)\s*[:：]\s*(.{4,})$/, confidence: 0.7 },
]

/** 定義文から「この説明にあてはまる語は？」という問題を作る */
export function definitionRule(ctx: RuleContext): DraftQuestion[] {
  const found: { term: string; definition: string; source: string; confidence: number }[] = []

  for (const sentence of ctx.text.sentences) {
    if (ctx.consumed.has(sentence.text)) continue

    for (const { re, confidence } of PATTERNS) {
      const m = re.exec(sentence.text)
      if (!m) continue

      const term = trimTerminator(m[1])
      const definition = trimTerminator(m[2])
      if (!isPlausibleTerm(term)) continue
      if (definition.length < 4 || definition.includes(term)) continue

      found.push({ term, definition, source: sentence.text, confidence })
      ctx.consumed.add(sentence.text)
      break
    }
  }

  // 同一資料内の他の「定義された用語」が最良の誤答になる
  const termPool = found.map((f) => f.term)

  return found.map(({ term, definition, source, confidence }) => ({
    prompt: `次の説明にあてはまる語句は？\n${definition}`,
    answer: term,
    // 定義された用語同士が最も紛らわしい。足りないときだけ一般語に広げる
    distractorPools: [termPool, ctx.keywords],
    sourceSentence: source,
    rule: 'definition' as const,
    confidence,
  }))
}
