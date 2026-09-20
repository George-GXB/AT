import { describe, expect, it } from 'vitest'
import { generateQuestions } from './index'
import { pickDistractors, similarity } from './distractors'
import { extractKeywords, isPlausibleTerm, normalizeText } from './normalize'
import { CHRONOLOGY, TEXTBOOK, VOCAB } from './fixtures'
import type { Question } from '../types'

/** 決定的なテストのための線形合同法 */
function seeded(seed = 42): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function generate(text: string) {
  let n = 0
  return generateQuestions(text, { rng: seeded(), idFactory: () => `q${n++}` })
}

/** どのルールで作られた問題でも常に満たすべき条件 */
function expectWellFormed(q: Question) {
  expect(q.choices).toHaveLength(4)
  expect(q.answerIndex).toBeGreaterThanOrEqual(0)
  expect(q.answerIndex).toBeLessThan(4)
  expect(new Set(q.choices).size).toBe(4)
  expect(q.choices[q.answerIndex]).toBeTruthy()
  expect(q.prompt.trim().length).toBeGreaterThan(0)
  expect(q.sourceSentence.trim().length).toBeGreaterThan(0)
}

describe('normalize', () => {
  it('全角英数を半角にし、日本語の間の余分な空白を詰める', () => {
    const { lines } = normalizeText('１４６７ 年 に 応仁 の乱')
    expect(lines[0]).toBe('1467年に応仁の乱')
  })

  it('箇条書き記号があっても文として扱える', () => {
    const { sentences } = normalizeText('・光合成とは、養分をつくる働きである。')
    expect(sentences[0].text.startsWith('光合成')).toBe(true)
  })

  it('助詞で終わる語や記号を含む語は用語として認めない', () => {
    expect(isPlausibleTerm('光合成')).toBe(true)
    expect(isPlausibleTerm('植物は')).toBe(false)
    expect(isPlausibleTerm('あ')).toBe(false)
    expect(isPlausibleTerm('光合成、呼吸')).toBe(false)
  })

  it('資料中の用語を拾える', () => {
    const keywords = extractKeywords(normalizeText(TEXTBOOK))
    expect(keywords).toContain('光合成')
    expect(keywords).toContain('葉緑体')
  })
})

describe('pickDistractors', () => {
  it('正解と同じ語・包含関係の語は誤答にしない', () => {
    const got = pickDistractors('応仁の乱', ['応仁の乱', '応仁', '島原の乱', '壬申の乱', '保元の乱'], 3, seeded())
    expect(got).not.toBeNull()
    expect(got).not.toContain('応仁の乱')
    expect(got).not.toContain('応仁')
    expect(new Set(got!).size).toBe(3)
  })

  it('候補が足りなければ null を返す(不自然な4択を作らない)', () => {
    expect(pickDistractors('光合成', ['呼吸', '蒸散'], 3, seeded())).toBeNull()
  })

  it('文字種と長さが近い語ほど似ていると評価する', () => {
    expect(similarity('光合成', '蒸散作用')).toBeGreaterThan(similarity('光合成', 'photosynthesis'))
  })
})

describe('教科書風のテキスト', () => {
  const { questions, stats } = generate(TEXTBOOK)

  it('定義文から問題を作る', () => {
    expect(stats.byRule.definition).toBeGreaterThanOrEqual(3)
  })

  it('「光合成」を答えとする問題があり、説明文が問題文になっている', () => {
    const q = questions.find((x) => x.choices[x.answerIndex] === '光合成')
    expect(q).toBeDefined()
    expect(q!.prompt).toContain('養分')
    expect(q!.prompt).not.toContain('光合成')
  })

  it('誤答は同じ資料内の他の用語から選ばれる', () => {
    const q = questions.find((x) => x.choices[x.answerIndex] === '光合成')!
    const others = q.choices.filter((_, i) => i !== q.answerIndex)
    for (const o of others) expect(TEXTBOOK).toContain(o)
  })

  it('すべての問題が4択として成立している', () => {
    expect(questions.length).toBeGreaterThan(0)
    questions.forEach(expectWellFormed)
  })
})

describe('英単語リスト', () => {
  const { questions, stats } = generate(VOCAB)

  it('英→日と日→英の両方向を作る', () => {
    expect(stats.byRule.vocab).toBeGreaterThanOrEqual(10)
    expect(questions.some((q) => q.prompt.includes('の意味は？'))).toBe(true)
    expect(questions.some((q) => q.prompt.includes('英語で書くと？'))).toBe(true)
  })

  it('英単語の意味を問う問題の誤答はすべて日本語の訳語', () => {
    const q = questions.find((x) => x.prompt.includes('「accomplish」'))
    expect(q).toBeDefined()
    expect(q!.choices[q!.answerIndex]).toBe('成し遂げる')
    for (const c of q!.choices) expect(c).not.toMatch(/[A-Za-z]/)
  })

  it('連番(1. 2. …)を問題に混入させない', () => {
    for (const q of questions) expect(q.choices.join('')).not.toMatch(/^\d+\.$/)
    questions.forEach(expectWellFormed)
  })
})

describe('年表', () => {
  const { questions, stats } = generate(CHRONOLOGY)

  it('年号を空欄にした問題を作る', () => {
    expect(stats.byRule.numeric).toBeGreaterThanOrEqual(3)
  })

  it('空欄の問題文に答えの年号が残っていない', () => {
    const q = questions.find((x) => x.choices[x.answerIndex] === '1467年')
    expect(q).toBeDefined()
    expect(q!.prompt).toContain('応仁の乱')
    expect(q!.prompt).not.toContain('1467')
  })

  it('誤答も年号の形をしている', () => {
    const q = questions.find((x) => x.choices[x.answerIndex] === '1467年')!
    for (const c of q.choices) expect(c).toMatch(/^\d+年$/)
    questions.forEach(expectWellFormed)
  })
})

describe('generateQuestions 全体', () => {
  it('同じ答えの問題を重複して出さない', () => {
    const { questions } = generate(TEXTBOOK)
    const keys = questions.map((q) => `${q.rule}:${q.choices[q.answerIndex]}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('確信度の高い順に並ぶ', () => {
    const { questions } = generate(TEXTBOOK)
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i - 1].confidence).toBeGreaterThanOrEqual(questions[i].confidence)
    }
  })

  it('材料が乏しいテキストでは無理に問題を作らない', () => {
    const { questions } = generate('こんにちは。')
    expect(questions).toHaveLength(0)
  })

  it('上限を超えて生成しない', () => {
    const { questions } = generateQuestions(TEXTBOOK.repeat(3), { rng: seeded(), maxQuestions: 2 })
    expect(questions.length).toBeLessThanOrEqual(2)
  })
})
