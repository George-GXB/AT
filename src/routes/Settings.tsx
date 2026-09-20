import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { deleteAll, deleteDeck, formatBytes, getUsage } from '../db/storage'
import { importBackup, shareOrDownloadBackup } from '../db/backup'
import { BackButton, Banner, Meter, Screen } from '../ui/Layout'

interface SettingsProps {
  onBack: () => void
}

export function Settings({ onBack }: SettingsProps) {
  const decks = useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), [])
  const usage = useLiveQuery(() => getUsage(), [decks])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 削除は取り返しがつかないので、対象を選んでからもう一度押させる */
  const [pendingDelete, setPendingDelete] = useState<number | 'all' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setError(null)
    try {
      const how = await shareOrDownloadBackup()
      setMessage(
        how === 'shared'
          ? '共有シートからファイルへ保存できます。'
          : 'バックアップファイルを書き出しました。',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '書き出しに失敗しました。')
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError(null)
    setMessage(null)
    try {
      const { added, skipped } = await importBackup(file)
      setMessage(`${added}件の問題集を読み込みました${skipped > 0 ? `（${skipped}件は形式が違うため無視）` : ''}。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました。')
    }
  }

  const tone = usage?.overLimit ? 'over' : usage?.nearLimit ? 'warn' : undefined

  return (
    <Screen title="設定" left={<BackButton onClick={onBack} />}>
      {message && <Banner tone="info">{message}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="section-title" style={{ marginTop: 0 }}>
        保存容量
      </div>
      <div className="card">
        {usage ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>{formatBytes(usage.appBytes)}</strong>
              <span className="spacer" />
              <span className="muted">上限 {formatBytes(usage.limitBytes)}</span>
            </div>
            <Meter ratio={usage.ratio} tone={tone} />
            <div className="muted" style={{ marginTop: 8 }}>
              {usage.browserUsage !== undefined &&
                `ブラウザ実測 ${formatBytes(usage.browserUsage)}`}
              {usage.persisted !== undefined &&
                ` ・ データ保護 ${usage.persisted ? '有効' : '未許可'}`}
            </div>
            {usage.persisted === false && (
              <div className="muted" style={{ marginTop: 8 }}>
                iOS はしばらく使っていないサイトのデータを消すことがあります。大切な問題集は
                バックアップを書き出しておいてください。
              </div>
            )}
          </>
        ) : (
          <span className="muted">計測中…</span>
        )}
      </div>

      <div className="section-title">バックアップ</div>
      <div className="stack">
        <button type="button" className="btn" onClick={handleExport}>
          問題集を書き出す
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          バックアップを読み込む
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleImport}
        />
      </div>

      <div className="section-title">問題集ごとの使用量</div>
      {decks?.length === 0 && <p className="muted">保存された問題集はありません。</p>}
      {decks?.map((deck) => (
        <div key={deck.id} className="card">
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{deck.name}</div>
              <div className="muted">
                {deck.questions.length}問 ・ {formatBytes(deck.bytes)}
              </div>
            </div>
            {pendingDelete === deck.id ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    await deleteDeck(deck.id!)
                    setPendingDelete(null)
                  }}
                >
                  本当に削除
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
                  やめる
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--wrong)' }}
                onClick={() => setPendingDelete(deck.id!)}
              >
                削除
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="section-title">すべて削除</div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          端末に保存された問題集をすべて消します。元に戻せません。
        </p>
        {pendingDelete === 'all' ? (
          <div className="row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                await deleteAll()
                setPendingDelete(null)
                setMessage('すべての問題集を削除しました。')
              }}
            >
              本当にすべて削除
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
              やめる
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-danger" onClick={() => setPendingDelete('all')}>
            すべての問題集を削除
          </button>
        )}
      </div>
    </Screen>
  )
}
