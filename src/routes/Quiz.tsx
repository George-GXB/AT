import { useEffect, useRef, useState } from 'react'
import type { Question } from '../types'
import { Meter, Screen } from '../ui/Layout'

export interface QuizOutcome {
  total: number
  correct: number
  /** 間違えた問題。結果画面から再挑戦するために持ち回る */
  wrong: Question[]
}

interface QuizProps {
  title: string
  questions: Question[]
  onExit: () => void
  onFinish: (outcome: QuizOutcome) => void
}

const CHOICE_LABELS = ['A', 'B', 'C', 'D']

export function Quiz({ title, questions, onExit, onFinish }: QuizProps) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrong, setWrong] = useState<Question[]>([])
  const explainRef = useRef<HTMLDivElement>(null)

  const question = questions[index]
  const answered = selected !== null
  const isCorrect = selected === question.answerIndex
  const isLast = index === questions.length - 1

  // 答え合わせの結果が画面外だと気づけないので、解説までスクロールする
  useEffect(() => {
    if (answered) explainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [answered])

  function answer(choiceIndex: number) {
    if (answered) return
    setSelected(choiceIndex)
    if (choiceIndex === question.answerIndex) {
      setCorrectCount((n) => n + 1)
    } else {
      setWrong((list) => [...list, question])
    }
  }

  function next() {
    if (isLast) {
      onFinish({ total: questions.length, correct: correctCount, wrong })
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
  }

  function choiceClass(choiceIndex: number): string {
    if (!answered) return 'choice'
    if (choiceIndex === question.answerIndex) return 'choice is-correct'
    if (choiceIndex === selected) return 'choice is-wrong'
    return 'choice is-dimmed'
  }

  return (
    <Screen
      title={title}
      left={
        <button type="button" className="btn btn-ghost" onClick={onExit}>
          やめる
        </button>
      }
      footer={
        <button type="button" className="btn btn-primary" disabled={!answered} onClick={next}>
          {answered ? (isLast ? '結果を見る' : '次の問題へ') : '選択肢を選んでください'}
        </button>
      }
    >
      <div className="progress-line">
        <span>
          {index + 1} / {questions.length}
        </span>
        <Meter ratio={(index + (answered ? 1 : 0)) / questions.length} />
        <span>正解 {correctCount}</span>
      </div>

      <div className="prompt">{question.prompt}</div>

      <div className="choices" style={{ marginTop: 20 }}>
        {question.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            className={choiceClass(i)}
            disabled={answered}
            onClick={() => answer(i)}
          >
            <span className="choice-mark">
              {answered && i === question.answerIndex
                ? '○'
                : answered && i === selected
                  ? '×'
                  : CHOICE_LABELS[i]}
            </span>
            <span className="choice-text">{choice}</span>
          </button>
        ))}
      </div>

      {answered && (
        <div ref={explainRef} style={{ marginTop: 20 }}>
          <div className={`verdict ${isCorrect ? 'ok' : 'ng'}`}>
            {isCorrect ? '正解' : '不正解'}
            {!isCorrect && (
              <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>
                正解は「{question.choices[question.answerIndex]}」
              </span>
            )}
          </div>
          <div className="explain">{question.sourceSentence}</div>
        </div>
      )}
    </Screen>
  )
}
