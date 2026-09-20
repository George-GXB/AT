/**
 * OCR 用アセットを public/ に用意する。
 *
 * - tesseract.js の worker / wasm コアを node_modules からコピー
 * - 日本語・英語の学習済みデータをダウンロード
 *
 * すべて public/ に置いてアプリから同一オリジンで読むため、
 * 実行時に外部へ通信することはない(＝オフラインで動く・費用もかからない)。
 */
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORE_DIR = join(root, 'node_modules', 'tesseract.js-core')
const WORKER_FILE = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js')
const OUT_CORE = join(root, 'public', 'tesseract')
const OUT_LANG = join(root, 'public', 'tessdata')

const TESSDATA_BASE = 'https://tessdata.projectnaptha.com/4.0.0'
const LANGS = ['jpn', 'eng']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function copyCore() {
  await mkdir(OUT_CORE, { recursive: true })
  const names = (await readdir(CORE_DIR)).filter((n) => n.startsWith('tesseract-core'))
  if (names.length === 0) throw new Error('tesseract.js-core が見つかりません。npm install を実行してください。')

  for (const name of names) {
    await copyFile(join(CORE_DIR, name), join(OUT_CORE, name))
  }
  await copyFile(WORKER_FILE, join(OUT_CORE, 'worker.min.js'))
  console.log(`  コア ${names.length + 1} ファイルをコピーしました -> public/tesseract/`)
}

async function fetchLang(lang) {
  const dest = join(OUT_LANG, `${lang}.traineddata.gz`)
  if (await exists(dest)) {
    console.log(`  ${lang}: 取得済みのためスキップ`)
    return
  }

  const url = `${TESSDATA_BASE}/${lang}.traineddata.gz`
  process.stdout.write(`  ${lang}: ダウンロード中… `)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${url} の取得に失敗しました (HTTP ${res.status})`)

  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  const { size } = await stat(dest)
  console.log(`${(size / 1024 / 1024).toFixed(1)} MB`)
}

async function main() {
  console.log('OCR アセットを準備します')
  await copyCore()
  await mkdir(OUT_LANG, { recursive: true })
  for (const lang of LANGS) await fetchLang(lang)
  console.log('完了しました。npm run dev で OCR が使えます。')
}

main().catch((err) => {
  console.error('\n失敗しました:', err.message)
  process.exitCode = 1
})
