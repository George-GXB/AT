import type { RuleKind } from '../../types'
import type { NormalizedText } from '../normalize'

export interface RuleContext {
  text: NormalizedText
  /** 文書全体から集めた用語。誤答プールの母集団 */
  keywords: string[]
  /** 既に他ルールが問題化した文。重複出題を避けるために共有する */
  consumed: Set<string>
}

/**
 * ルールが返す問題の素案。
 * 誤答の確定とシャッフルは generator/index.ts が一括で行う
 * ―― 誤答生成ロジックを 1 か所に集約するため。
 */
export interface DraftQuestion {
  prompt: string
  answer: string
  /**
   * 誤答候補を優先度順に並べたもの。
   * 前のプールで3つ揃えばそれを使い、足りなければ次のプールへ落とす。
   * (例: 定義された用語 → 資料中の一般的な語句)
   */
  distractorPools: string[][]
  sourceSentence: string
  rule: RuleKind
  confidence: number
}
