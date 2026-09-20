import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { appendToDeck, createDeck } from '../db/storage'
import { RULE_LABEL, type Question } from '../types'
import { BackButton, Banner, Screen } from '../ui/Layout'

interface ReviewProps {
  questions: Question[]
  droppedCount: number
  onBack: () => void
  onSaved: () => void
}

/** これ未満は自動生成の精度が怪しいので「要確認」を出す */
const LOW_CONFIDENCE = 0.7

const CHOICE_LABELS = ['A', 'B', 'C', 'D']

interface Item extends Question {
  selected: boolean
}

function defaultDeckName(): string {
  const now = new Date()
  // 「9/20」のような表記は出題画面のヘッダーで問題数と紛らわしいので使わない
  return `問題集 ${now.getMonth() + 1}月${now.getDate()}日`
}

export function Review({ questions, droppedCount, onBack, onSaved }: ReviewProps) {
  const [items, setItems] = useState<Item[]>(() => questions.map((q) => ({ ...q, selected: true })))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [target, setTarget] = useState<'new' | number>('new')
  const [deckName, setDeckName] = useState(defaultDeckName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const decks = useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), [])
  const selectedCount = items.filter((i) => i.selected).length

  function update(id: string, patch: Partial<Item>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function updateChoice(id: string, index: number, value: string) {
    setItems((list) =>
      list.map((i) =>
        i.id === id ? { ...i, choices: i.choices.map((c, k) => (k === index ? value : c)) } : i,
      ),
    )
  }

  function remove(id: string) {
    setItems((list) => list.filter((i) => i.id !== id))
  }

  async function save() {
    const chosen = items
      .filter((i) => i.selected)
      .map(({ selected: _selected, ...q }) => q)

    if (chosen.length === 0) return
    setSaving(true)
    setError(null)
    try {
      if (target === 'new') {
        await createDeck(deckName.trim() || defaultDeckName(), chosen)
      } else {
        await appendToDeck(target, chosen)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました。')
      setSaving(false)
    }
  }

  return (
    <Screen
      title={`${selectedCount} / ${items.length} 問を採用`}
      left={<BackButton onClick={onBack} />}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || selectedCount === 0}
          onClick={save}
        >
          {selectedCount}問を保存する
        </button>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}

      {droppedCount > 0 && (
        <Banner tone="info">
          紛らわしい誤答を3つ用意できなかった{droppedCount}問は、不自然な4択になるため除外しました。
        </Banner>
      )}

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          保存先
        </div>
        <select
          className="field"
          value={String(target)}
          onChange={(e) => setTarget(e.target.value === 'new' ? 'new' : Number(e.target.value))}
        >
          <option value="new">新しい問題集をつくる</option>
          {decks?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} に追加（現在{d.questions.length}問）
            </option>
          ))}
        </select>
        {target === 'new' && (
          <input
            className="field"
            style={{ marginTop: 8 }}
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="問題集の名前"
          />
        )}
      </div>

      <div className="section-title">生成された問題</div>

      {items.map((item) => {
        const editing = editingId === item.id
        return (
          <div key={item.id} className="card" style={{ opacity: item.selected ? 1 : 0.5 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(e) => update(item.id, { selected: e.target.checked })}
                  style={{ width: 22, height: 22 }}
                />
                <span className="badge">{RULE_LABEL[item.rule]}</span>
              </label>
              {item.confidence < LOW_CONFIDENCE && <span className="badge badge-warn">要確認</span>}
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingId(editing ? null : item.id)}
              >
                {editing ? '完了' : '編集'}
              </button>
            </div>

            {editing ? (
              <div className="stack">
                <textarea
                  className="field"
                  style={{ minHeight: 90 }}
                  value={item.prompt}
                  onChange={(e) => update(item.id, { prompt: e.target.value })}
                />
                {item.choices.map((choice, index) => (
                  <label key={index} className="row">
                    <input
                      type="radio"
                      name={`answer-${item.id}`}
                      checked={item.answerIndex === index}
                      onChange={() => update(item.id, { answerIndex: index })}
                      style={{ width: 22, height: 22, flex: 'none' }}
                    />
                    <input
                      className="field"
                      value={choice}
                      onChange={(e) => updateChoice(item.id, index, e.target.value)}
                    />
                  </label>
                ))}
                <div className="muted">丸を付けた選択肢が正解になります。</div>
                <button type="button" className="btn btn-danger" onClick={() => remove(item.id)}>
                  この問題を削除
                </button>
              </div>
            ) : (
              <>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{item.prompt}</div>
                <div className="muted">
                  {item.choices.map((c, i) => (
                    <div key={i} style={{ color: i === item.answerIndex ? 'var(--correct)' : undefined }}>
                      {CHOICE_LABELS[i]}. {c}
                      {i === item.answerIndex && ' ← 正解'}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </Screen>
  )
}
