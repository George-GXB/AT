/**
 * PWA 用アイコンを生成する。
 *
 * 画像ライブラリを足さずに済むよう、RGBA を自前で組み立てて
 * Node 標準の zlib だけで PNG に書き出す。
 * 図案は「4つの選択肢のうち1つが正解」を表す 2x2 のマス目。
 */
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [15, 17, 21, 255]
const ACCENT = [76, 141, 255, 255]
const MUTED = [58, 64, 78, 255]

// ---- PNG 書き出し -------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 10..12: compression / filter / interlace = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 図案 ---------------------------------------------------------

/** 角丸四角形の内側かどうか(境界はアンチエイリアスのため 0..1 で返す) */
function roundedRectCoverage(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const d = Math.hypot(px - cx, py - cy)
  if (px < x - 1 || px > x + w + 1 || py < y - 1 || py > y + h + 1) return 0
  return Math.min(1, Math.max(0, r + 0.5 - d))
}

function blend(target, offset, color, alpha) {
  for (let c = 0; c < 3; c++) {
    target[offset + c] = Math.round(target[offset + c] * (1 - alpha) + color[c] * alpha)
  }
  target[offset + 3] = 255
}

/**
 * @param size 画像サイズ
 * @param inset マスカブル用に図案を内側へ寄せる割合(0..0.5)
 */
function render(size, inset) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) rgba.set(BG, i * 4)

  const area = size * (1 - inset * 2)
  const origin = size * inset
  const gap = area * 0.085
  const cell = (area - gap) / 2
  const radius = cell * 0.26

  const cells = [
    { x: 0, y: 0, on: true },
    { x: 1, y: 0, on: false },
    { x: 0, y: 1, on: false },
    { x: 1, y: 1, on: false },
  ]

  for (const { x, y, on } of cells) {
    const left = origin + x * (cell + gap)
    const top = origin + y * (cell + gap)
    const color = on ? ACCENT : MUTED

    for (let py = Math.floor(top) - 1; py <= Math.ceil(top + cell) + 1; py++) {
      if (py < 0 || py >= size) continue
      for (let px = Math.floor(left) - 1; px <= Math.ceil(left + cell) + 1; px++) {
        if (px < 0 || px >= size) continue
        const outer = roundedRectCoverage(px + 0.5, py + 0.5, left, top, cell, cell, radius)
        if (outer <= 0) continue

        if (on) {
          blend(rgba, (py * size + px) * 4, color, outer)
        } else {
          // 未選択のマスは枠線だけにして、正解のマスを目立たせる
          const border = Math.max(2, cell * 0.075)
          const inner = roundedRectCoverage(
            px + 0.5,
            py + 0.5,
            left + border,
            top + border,
            cell - border * 2,
            cell - border * 2,
            Math.max(1, radius - border),
          )
          blend(rgba, (py * size + px) * 4, color, Math.max(0, outer - inner))
        }
      }
    }
  }

  return encodePng(size, size, rgba)
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0f1115"/>
  <rect x="14" y="14" width="33" height="33" rx="9" fill="#4c8dff"/>
  <rect x="55.5" y="15.5" width="30" height="30" rx="7.5" fill="none" stroke="#3a404e" stroke-width="3"/>
  <rect x="15.5" y="55.5" width="30" height="30" rx="7.5" fill="none" stroke="#3a404e" stroke-width="3"/>
  <rect x="55.5" y="55.5" width="30" height="30" rx="7.5" fill="none" stroke="#3a404e" stroke-width="3"/>
</svg>
`

await mkdir(OUT, { recursive: true })
await Promise.all([
  writeFile(join(OUT, 'icon-192.png'), render(192, 0.16)),
  writeFile(join(OUT, 'icon-512.png'), render(512, 0.16)),
  // マスカブルは外周 20% が切り取られうるので図案をさらに内側へ寄せる
  writeFile(join(OUT, 'icon-maskable-512.png'), render(512, 0.24)),
  writeFile(join(OUT, 'apple-touch-icon.png'), render(180, 0.16)),
  writeFile(join(OUT, 'favicon.svg'), SVG),
])

console.log('public/icons/ にアイコンを生成しました。')
