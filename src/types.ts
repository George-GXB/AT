/** 問題を生成したルールの種類。確認画面のバッジ表示にも使う。 */
export type RuleKind = 'definition' | 'vocab' | 'numeric' | 'cloze'

export const RULE_LABEL: Record<RuleKind, string> = {
  definition: '用語・定義',
  vocab: '英単語',
  numeric: '年号・数値',
  cloze: '穴埋め',
}

export interface Question {
  id: string
  /** 問題文 */
  prompt: string
  /** 4択。保存時点でシャッフル済み */
  choices: string[]
  /** choices 内の正解位置 */
  answerIndex: number
  /** 生成元の文。答え合わせ時に解説として見せる */
  sourceSentence: string
  rule: RuleKind
  /** 0..1。低いものは確認画面で「要確認」を出す */
  confidence: number
}

export interface Deck {
  id?: number
  name: string
  createdAt: number
  updatedAt: number
  questions: Question[]
  /** JSON 換算の概算バイト数。1GB 上限の集計に使う */
  bytes: number
  lastPlayedAt?: number
  /** 直近の正答率(0..1) */
  lastScore?: number
}
