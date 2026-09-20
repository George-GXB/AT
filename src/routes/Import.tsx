import { useEffect, useRef, useState } from 'react'
import { generateQuestions } from '../generator'
import { recognizeImages, terminateOcr, type OcrProgress } from '../ocr/recognize'
import type { Question } from '../types'
import { BackButton, Banner, Meter, Screen } from '../ui/Layout'

interface ImportProps {
  onBack: () => void
  onGenerated: (questions: Question[], droppedCount: number) => void
}

/** これより短いテキストからは問題を作れない */
const MIN_TEXT_LENGTH = 20

export function Import({ onBack, onGenerated }: ImportProps) {
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // 画面を離れるときに wasm のメモリを解放する(iPhone のメモリは限られる)
  useEffect(() => () => void terminateOcr(), [])

  const busy = progress !== null

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // input が参照を持ち続けないよう、取り出したらすぐ空にする
    event.target.value = ''
    if (files.length === 0) return

    setError(null)
    setNotice(null)
    setProgress({ stage: 'preparing', ratio: 0, fileIndex: 0, fileCount: files.length })

    try {
      const recognized = await recognizeImages(files, setProgress)
      setText((current) => (current ? `${current}\n${recognized}` : recognized))
      setNotice(`画像${files.length}枚を文字に変換し、画像そのものは破棄しました。`)
    } catch (err) {
      // tesseract.js は Error 以外(文字列など)を投げてくることがある
      console.error('[ocr]', err)
      const detail = err instanceof Error ? err.message : String(err)
      setError(`文字起こしに失敗しました。${detail}`)
    } finally {
      // files 配列はこのスコープを抜けると参照されなくなる
      files.length = 0
      setProgress(null)
    }
  }

  function handleGenerate() {
    const { questions, stats } = generateQuestions(text)
    if (questions.length === 0) {
      setError(
        '問題を作れる箇所が見つかりませんでした。「〇〇とは…である」のような説明文や、' +
          '英単語と訳の対応、年号を含む文があると問題になります。',
      )
      return
    }
    onGenerated(questions, stats.droppedForDistractors)
  }

  const progressLabel =
    progress?.stage === 'preparing'
      ? '文字認識エンジンを準備中…'
      : progress
        ? `読み取り中… (${progress.fileIndex + 1}/${progress.fileCount}枚目)`
        : ''

  return (
    <Screen
      title="問題を作る"
      left={<BackButton onClick={onBack} />}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || text.trim().length < MIN_TEXT_LENGTH}
          onClick={handleGenerate}
        >
          この内容から問題を作る
        </button>
      }
    >
      <Banner tone="info">
        画像は端末の中だけで処理され、どこにも送信されません。文字に変換した時点で破棄され、保存もされません。
      </Banner>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && !busy && <Banner tone="info">{notice}</Banner>}

      {busy && progress && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 8 }}>
            {progressLabel}
          </div>
          <Meter ratio={progress.ratio} />
        </div>
      )}

      <div className="stack">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          画像を選ぶ / 撮影する
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFiles}
        />

        <div>
          <div className="section-title">読み取った文章（直接編集できます）</div>
          <textarea
            className="field"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '写真アプリで文字を長押し → コピー して、ここに貼り付けることもできます。\n' +
              'iPhone 標準の文字認識のほうが正確なので、読み取りがうまくいかないときはこちらをお使いください。'
            }
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="row">
            <span className="muted">{text.trim().length}文字</span>
            <span className="spacer" />
            {text.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setText('')}>
                クリア
              </button>
            )}
          </div>
        </div>
      </div>
    </Screen>
  )
}
