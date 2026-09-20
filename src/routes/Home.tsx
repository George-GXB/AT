import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { getUsage } from '../db/storage'
import { shuffle } from '../generator/distractors'
import type { Question } from '../types'
import { Banner, Empty, Screen } from '../ui/Layout'

interface HomeProps {
  onImport: () => void
  onSettings: () => void
  onPlay: (deckId: number, title: string, questions: Question[]) => void
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export function Home({ onImport, onSettings, onPlay }: HomeProps) {
  const decks = useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), [])
  const usage = useLiveQuery(() => getUsage(), [decks?.length])

  return (
    <Screen
      title="一問一答"
      right={
        <button type="button" className="btn btn-ghost" onClick={onSettings}>
          設定
        </button>
      }
      footer={
        <button type="button" className="btn btn-primary" onClick={onImport}>
          画像・テキストから問題を作る
        </button>
      }
    >
      {usage?.nearLimit && (
        <Banner tone={usage.overLimit ? 'error' : 'warn'}>
          {usage.overLimit
            ? '保存容量が上限(1GB)に達しています。設定画面から不要な問題集を削除してください。'
            : '保存容量が上限(1GB)に近づいています。設定画面から使用量を確認できます。'}
        </Banner>
      )}

      {decks === undefined && <p className="muted">読み込み中…</p>}

      {decks?.length === 0 && (
        <Empty title="まだ問題集がありません">
          <p>
            教科書やノートを撮った画像を取り込むと、
            <br />
            その内容から4択問題を自動で作ります。
          </p>
        </Empty>
      )}

      {decks?.map((deck) => (
        <button
          key={deck.id}
          type="button"
          className="card"
          style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => onPlay(deck.id!, deck.name, shuffle(deck.questions))}
        >
          <div style={{ fontSize: 17, fontWeight: 700 }}>{deck.name}</div>
          <div className="muted">
            {deck.questions.length}問 ・ {formatDate(deck.updatedAt)}更新
            {deck.lastScore !== undefined && ` ・ 前回 ${Math.round(deck.lastScore * 100)}%`}
          </div>
        </button>
      ))}
    </Screen>
  )
}
