import type { Question } from '../types'
import { extractKeywords, normalizeText } from './normalize'
import { buildChoices, DISTRACTOR_COUNT, pickDistractors, type Rng } from './distractors'
import type { DraftQuestion, RuleContext } from './rules/types'
import { definitionRule } from './rules/definition'
import { vocabRule } from './rules/vocab'
import { numericRule } from './rules/numeric'
import { clozeRule } from './rules/cloze'

export { BLANK } from './rules/numeric'

/** 1回の取り込みで作る問題数の上限 */
export const MAX_QUESTIONS = 200

export interface GenerateOptions {
  rng?: Rng
  maxQuestions?: number
  /** テスト用に ID を固定したい場合に差し替える */
  idFactory?: () => string
}

export interface GenerateStats {
  /** ルール別に何問できたか */
  byRule: Record<string, number>
  /** 誤答を3つ揃えられず捨てた問題数 */
  droppedForDistractors: number
  totalSentences: number
}

export interface GenerateResult {
  questions: Question[]
  stats: GenerateStats
}

let counter = 0
function defaultId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  counter += 1
  return `q-${Date.now().toString(36)}-${counter}`
}

/**
 * 素案から 4 択を確定させる。
 * 誤答が 3 つ揃わないものは捨てる ―― 不自然な選択肢を出さないため。
 */
function finalize(
  draft: DraftQuestion,
  rng: Rng,
  idFactory: () => string,
): Question | null {
  let distractors: string[] | null = null
  for (const pool of draft.distractorPools) {
    distractors = pickDistractors(draft.answer, pool, DISTRACTOR_COUNT, rng)
    if (distractors) break
  }
  if (!distractors) return null

  const { choices, answerIndex } = buildChoices(draft.answer, distractors, rng)
  return {
    id: idFactory(),
    prompt: draft.prompt,
    choices,
    answerIndex,
    sourceSentence: draft.sourceSentence,
    rule: draft.rule,
    confidence: draft.confidence,
  }
}

/**
 * 文字起こしテキストから4択問題を生成する。
 * 精度の高いルールから順に適用し、使い終わった文は後続ルールに渡さない。
 */
export function generateQuestions(raw: string, options: GenerateOptions = {}): GenerateResult {
  const rng = options.rng ?? Math.random
  const idFactory = options.idFactory ?? defaultId
  const limit = options.maxQuestions ?? MAX_QUESTIONS

  const text = normalizeText(raw)
  const ctx: RuleContext = {
    text,
    keywords: extractKeywords(text),
    consumed: new Set<string>(),
  }

  const drafts: DraftQuestion[] = [
    ...vocabRule(ctx),
    ...definitionRule(ctx),
    ...numericRule(ctx),
    ...clozeRule(ctx),
  ]

  const byRule: Record<string, number> = {}
  let droppedForDistractors = 0
  const seenAnswers = new Set<string>()
  const questions: Question[] = []

  for (const draft of drafts) {
    // 同じ答えの問題が並ぶと学習効率が落ちるため、確信度の高い方だけ残す
    const key = `${draft.rule}:${draft.answer}`
    if (seenAnswers.has(key)) continue

    const question = finalize(draft, rng, idFactory)
    if (!question) {
      droppedForDistractors++
      continue
    }

    seenAnswers.add(key)
    byRule[draft.rule] = (byRule[draft.rule] ?? 0) + 1
    questions.push(question)
  }

  questions.sort((a, b) => b.confidence - a.confidence)

  return {
    questions: questions.slice(0, limit),
    stats: { byRule, droppedForDistractors, totalSentences: text.sentences.length },
  }
}
