/** OCR に渡す前の画像処理。長辺をこのサイズまで縮める */
const MAX_SIDE = 2000
/** 局所平均から何割暗ければ文字とみなすか */
const THRESHOLD_BIAS = 0.14

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyContext2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Safari は canvas を 0×0 にすると確保していたメモリを解放する */
function releaseCanvas(canvas: AnyCanvas): void {
  canvas.width = 0
  canvas.height = 0
}

/**
 * 写真は照明のムラが大きく、単純な二値化では影の部分が潰れる。
 * 積分画像で局所平均を求め、その場所ごとのしきい値で白黒に分ける。
 */
function binarize(image: ImageData): void {
  const { width, height, data } = image
  const gray = new Uint8Array(width * height)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }

  // 積分画像(1画素ぶん余白を取って境界処理を単純にする)
  const iw = width + 1
  const integral = new Uint32Array(iw * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum
    }
  }

  const radius = Math.max(8, Math.round(Math.min(width, height) / 32))

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height - 1, y + radius)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      const area = (y1 - y0 + 1) * (x1 - x0 + 1)
      const sum =
        integral[(y1 + 1) * iw + (x1 + 1)] -
        integral[y0 * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] +
        integral[y0 * iw + x0]
      const mean = sum / area
      const value = gray[y * width + x] < mean * (1 - THRESHOLD_BIAS) ? 0 : 255
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = value
      data[i + 3] = 255
    }
  }
}

/** tesseract.js のワーカーは PNG などのエンコード済み画像を要求する */
async function toPngBlob(canvas: AnyCanvas): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    (canvas as HTMLCanvasElement).toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('画像を変換できませんでした。')
  return blob
}

/**
 * 画像ファイルを OCR 向けの白黒 PNG に変換する。
 * 元の File / ImageBitmap / canvas はこの関数を抜ける時点で解放され、
 * 呼び出し側に残るのは変換後の Blob だけになる。
 */
export async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  let canvas: AnyCanvas | null = null
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d') as AnyContext2D | null
    if (!ctx) throw new Error('画像を処理できませんでした。')

    ctx.drawImage(bitmap, 0, 0, width, height)
    const image = ctx.getImageData(0, 0, width, height)
    binarize(image)
    ctx.putImageData(image, 0, 0)
    return await toPngBlob(canvas)
  } finally {
    bitmap.close()
    if (canvas) releaseCanvas(canvas)
  }
}
