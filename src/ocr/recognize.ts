import { createWorker, type Worker } from 'tesseract.js'
import { preprocessImage } from './preprocess'

/** 同一オリジンに置いた OCR アセット(外部への通信は発生しない) */
const BASE = import.meta.env.BASE_URL

export type OcrStage = 'preparing' | 'reading'

export interface OcrProgress {
  stage: OcrStage
  /** 0..1 */
  ratio: number
  fileIndex: number
  fileCount: number
}

interface LoggerMessage {
  status: string
  progress: number
}

let workerPromise: Promise<Worker> | null = null
/** worker は使い回すため、進捗の送り先だけを都度差し替える */
let activeLogger: ((message: LoggerMessage) => void) | null = null

function ensureWorker(): Promise<Worker> {
  workerPromise ??= createWorker(['jpn', 'eng'], 1, {
    workerPath: `${BASE}tesseract/worker.min.js`,
    corePath: `${BASE}tesseract`,
    langPath: `${BASE}tessdata`,
    gzip: true,
    logger: (m: LoggerMessage) => activeLogger?.(m),
  }).catch((err) => {
    // 失敗した Promise を残すと次回以降も同じエラーになる
    workerPromise = null
    throw err
  })
  return workerPromise
}

/**
 * 画像を順に文字起こしする。
 * 画像は preprocessImage の中だけで扱い、ここでも結果テキスト以外は保持しない。
 */
export async function recognizeImages(
  files: File[],
  onProgress: (progress: OcrProgress) => void,
): Promise<string> {
  const fileCount = files.length
  activeLogger = (m) => {
    if (m.status === 'recognizing text') return
    onProgress({ stage: 'preparing', ratio: m.progress, fileIndex: 0, fileCount })
  }

  let worker: Worker
  try {
    worker = await ensureWorker()
  } catch {
    throw new Error(
      'OCR の準備に失敗しました。npm run setup:ocr を実行して文字認識データを用意してください。',
    )
  }

  const texts: string[] = []
  try {
    for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
      activeLogger = (m) => {
        if (m.status !== 'recognizing text') return
        onProgress({ stage: 'reading', ratio: m.progress, fileIndex, fileCount })
      }
      const image = await preprocessImage(files[fileIndex])
      const { data } = await worker.recognize(image)
      texts.push(data.text)
    }
  } finally {
    activeLogger = null
  }

  return texts.join('\n')
}

/** 使い終わった worker と wasm のメモリを解放する */
export async function terminateOcr(): Promise<void> {
  const pending = workerPromise
  workerPromise = null
  activeLogger = null
  if (!pending) return
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    /* 起動に失敗していた場合は解放するものがない */
  }
}
