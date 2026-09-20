import { useCallback, useEffect, useState } from 'react'
import type { Question } from './types'
import { Home } from './routes/Home'
import { Import } from './routes/Import'
import { Review } from './routes/Review'
import { Quiz } from './routes/Quiz'
import { Result, type QuizOutcome } from './routes/Result'
import { Settings } from './routes/Settings'

export type Route =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'review'; questions: Question[]; droppedCount: number }
  | { name: 'quiz'; deckId: number; title: string; questions: Question[] }
  | { name: 'result'; deckId: number; title: string; outcome: QuizOutcome }
  | { name: 'settings' }

interface HistoryState {
  depth: number
}

export function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])
  const route = stack[stack.length - 1]

  // 画面の深さを history に持たせ、Safari の戻る操作/スワイプと同期させる。
  useEffect(() => {
    history.replaceState({ depth: 0 } satisfies HistoryState, '')
    const onPopState = (event: PopStateEvent) => {
      const depth = (event.state as HistoryState | null)?.depth ?? 0
      setStack((s) => (s.length > depth + 1 ? s.slice(0, depth + 1) : s))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // history の操作は state 更新関数の外で行う。
  // StrictMode は更新関数を二重に呼ぶため、中で副作用を起こすと履歴が二重に積まれる。
  const push = useCallback(
    (next: Route) => {
      history.pushState({ depth: stack.length } satisfies HistoryState, '')
      setStack((s) => [...s, next])
    },
    [stack.length],
  )

  const back = useCallback(() => history.back(), [])

  /** 履歴ごと最初の画面まで戻す(stack の更新は popstate 側で行われる) */
  const goHome = useCallback(() => {
    if (stack.length > 1) history.go(-(stack.length - 1))
  }, [stack.length])

  /** 取り込み→確認→保存 のあと履歴に確認画面を残さずホームへ戻す */
  const startQuiz = useCallback(
    (deckId: number, title: string, questions: Question[]) => {
      push({ name: 'quiz', deckId, title, questions })
    },
    [push],
  )

  switch (route.name) {
    case 'home':
      return (
        <Home
          onImport={() => push({ name: 'import' })}
          onSettings={() => push({ name: 'settings' })}
          onPlay={startQuiz}
        />
      )

    case 'import':
      return (
        <Import
          onBack={back}
          onGenerated={(questions, droppedCount) =>
            push({ name: 'review', questions, droppedCount })
          }
        />
      )

    case 'review':
      return (
        <Review
          questions={route.questions}
          droppedCount={route.droppedCount}
          onBack={back}
          onSaved={goHome}
        />
      )

    case 'quiz':
      return (
        <Quiz
          title={route.title}
          questions={route.questions}
          onExit={back}
          onFinish={(outcome) =>
            push({ name: 'result', deckId: route.deckId, title: route.title, outcome })
          }
        />
      )

    case 'result':
      return (
        <Result
          deckId={route.deckId}
          title={route.title}
          outcome={route.outcome}
          onHome={goHome}
          onRetry={(questions) => push({ name: 'quiz', deckId: route.deckId, title: route.title, questions })}
        />
      )

    case 'settings':
      return <Settings onBack={back} />
  }
}
