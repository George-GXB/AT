import type { DraftQuestion, RuleContext } from './types'

export const BLANK = '［　？　］'

const YEAR = /(\d{1,4})\s*年/g
const MEASURE = /(\d+(?:\.\d+)?)\s*(%|％|人|名|個|台|冊|回|cm|mm|m|km|g|kg|t|℃|度|倍|世紀|万|億)/g

interface NumToken {
  /** 文中の表記そのもの(例: 「1467年」) */
  text: string
  value: number
  unit: string
  index: number
}

function findTokens(sentence: string): NumToken[] {
  const tokens: NumToken[] = []
  for (const [re, fixedUnit] of [[YEAR, '年'], [MEASURE, '']] as const) {
    re.lastIndex = 0
    for (const m of sentence.matchAll(re)) {
      tokens.push({
        text: m[0].replace(/\s+/g, ''),
        value: Number(m[1]),
        unit: fixedUnit || m[2],
        index: m.index ?? 0,
      })
    }
  }
  // 年と単位付き数値が重なった場合は先に現れたものを優先する
  return tokens.sort((a, b) => a.index - b.index)
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** 資料内に十分な誤答がない場合に、値をずらして近い数値を作る */
function synthesize(token: NumToken): string[] {
  const offsets =
    token.unit === '年'
      ? [1, 2, 3, 5, 10, 20, 50, 100]
      : [1, 2, 5, 10].map((n) => Math.max(1, Math.round((token.value * n) / 10)))

  const out: string[] = []
  for (const d of offsets) {
    for (const sign of [1, -1]) {
      const v = token.value + sign * d
      if (v <= 0) continue
      const text = `${formatValue(v)}${token.unit}`
      if (text !== token.text && !out.includes(text)) out.push(text)
    }
  }
  return out
}

/** 年号や数値を空欄にして問う */
export function numericRule(ctx: RuleContext): DraftQuestion[] {
  // 資料全体の数値を単位ごとに集めておく(実在の数値のほうが誤答として自然)
  const byUnit = new Map<string, Set<string>>()
  for (const s of ctx.text.sentences) {
    for (const t of findTokens(s.text)) {
      if (!byUnit.has(t.unit)) byUnit.set(t.unit, new Set())
      byUnit.get(t.unit)!.add(t.text)
    }
  }

  const questions: DraftQuestion[] = []

  for (const sentence of ctx.text.sentences) {
    if (ctx.consumed.has(sentence.text)) continue

    const token = findTokens(sentence.text)[0]
    if (!token) continue

    const masked = sentence.text.replace(token.text, BLANK)
    // 数値を除いた文脈が短すぎると問題として成立しない
    if (masked.replace(BLANK, '').length < 6) continue

    // 資料に実在する数値のほうが誤答として自然。足りなければ値をずらして補う
    const real = [...(byUnit.get(token.unit) ?? [])].filter((t) => t !== token.text)
    const pools = [real, [...real, ...synthesize(token)]]

    questions.push({
      prompt: `次の文の空欄にあてはまるものは？\n${masked}`,
      answer: token.text,
      distractorPools: pools,
      sourceSentence: sentence.text,
      rule: 'numeric',
      confidence: real.length >= 3 ? 0.75 : 0.6,
    })
    ctx.consumed.add(sentence.text)
  }

  return questions
}
