import { useEffect } from 'react'
import { recordResult } from '../db/storage'
import { shuffle } from '../generator/distractors'
import type { Question } from '../types'
import { Screen } from '../ui/Layout'

export type { QuizOutcome } from './Quiz'
import type { QuizOutcome } from './Quiz'

interface ResultProps {
  deckId: number
  title: string
  outcome: QuizOutcome
  onHome: () => void
  onRetry: (questions: Question[]) => void
}

export function Result({ deckId, title, outcome, onHome, onRetry }: ResultProps) {
  const { total, correct, wrong } = outcome
  const ratio = total === 0 ? 0 : correct / total

  useEffect(() => {
    void recordResult(deckId, ratio)
  }, [deckId, ratio])

  return (
    <Screen
      title={title}
      footer={
        <>
          {wrong.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onRetry(shuffle(wrong))}
            >
              間違えた{wrong.length}問をもう一度
            </button>
          )}
          <button type="button" className="btn" onClick={onHome}>
            ホームに戻る
          </button>
        </>
      }
    >
      <div className="score">
        <div className="score-value">{Math.round(ratio * 100)}%</div>
        <div className="score-label">
          {total}問中 {correct}問 正解
        </div>
      </div>

      {wrong.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          全問正解です。
        </div>
      ) : (
        <>
          <div className="section-title">間違えた問題</div>
          {wrong.map((q) => (
            <div key={q.id} className="card">
              <div style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}>{q.prompt}</div>
              <div style={{ color: 'var(--correct)', fontWeight: 600 }}>
                正解: {q.choices[q.answerIndex]}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                {q.sourceSentence}
              </div>
            </div>
          ))}
        </>
      )}
    </Screen>
  )
}
