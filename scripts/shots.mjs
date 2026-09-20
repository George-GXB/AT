/**
 * iPhone 17 相当の画面サイズで各画面のスクリーンショットを撮る開発用スクリプト。
 *
 * 追加の依存を増やさないよう、インストール済みの Chromium 系ブラウザを
 * ヘッドレスで起動し、Node 標準の WebSocket から CDP を直接叩いている。
 *
 *   npm run dev   # 別ターミナルで先に起動しておく
 *   npm run shots
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'screenshots')
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const PORT = 9333

// iPhone 17 (6.3インチ) の CSS ピクセル
const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, mobile: true }

const BROWSERS = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findBrowser() {
  const { stat } = await import('node:fs/promises')
  for (const path of BROWSERS) {
    try {
      await stat(path)
      return path
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error('Chrome / Edge が見つかりませんでした。')
}

/** CDP の最小クライアント。1本の WebSocket をセッション付きで使い回す。 */
class Cdp {
  #ws
  #nextId = 1
  #pending = new Map()

  static async connect(url) {
    const cdp = new Cdp()
    cdp.#ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      cdp.#ws.addEventListener('open', resolve, { once: true })
      cdp.#ws.addEventListener('error', () => reject(new Error('CDP に接続できません')), { once: true })
    })
    cdp.#ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const waiter = cdp.#pending.get(msg.id)
      if (!waiter) return
      cdp.#pending.delete(msg.id)
      msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result)
    })
    return cdp
  }

  /** イベント(メソッド名で購読)を受け取る */
  on(method, handler) {
    this.#ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === method) handler(msg.params)
    })
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++
    this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }))
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }))
  }

  close() {
    this.#ws.close()
  }
}

async function main() {
  const browser = await findBrowser()
  const profile = await mkdtemp(join(tmpdir(), 'at-shots-'))
  await mkdir(OUT_DIR, { recursive: true })

  const child = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
    ],
    { stdio: 'ignore' },
  )

  let version
  for (let i = 0; i < 50; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch {
      await sleep(200)
    }
  }
  if (!version) throw new Error('ブラウザの起動に失敗しました。')

  const cdp = await Cdp.connect(version.webSocketDebuggerUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Log.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT, sessionId)

  // ページ側のエラーは黙って消えると原因が追えないので、そのまま流す
  const describe = (arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? ''
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error' || type === 'warning') {
      console.log(`  [console.${type}] ${args.map(describe).join(' ')}`)
    }
  })
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    console.log(`  [exception] ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`)
  })
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error') console.log(`  [log] ${entry.text} ${entry.url ?? ''}`)
  })

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    if (exceptionDetails) throw new Error(`${exceptionDetails.text}: ${result?.description ?? ''}`)
    return result.value
  }

  const shoot = async (name) => {
    await sleep(350)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    await writeFile(join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`  ${name}.png`)
  }

  await cdp.send('Page.navigate', { url: APP_URL }, sessionId)
  await sleep(1500)

  console.log('スクリーンショットを撮ります:')
  for (const step of (await import('./shots-steps.mjs')).steps) {
    if (step.run) await step.run(evaluate, sleep)
    if (step.shot) await shoot(step.shot)
  }

  // オフライン動作の前提となる Service Worker が登録できているかを確認する
  // (dev では無効なので、本番ビルドを配信したときだけ registered になる)
  const sw = await evaluate(`
    (async () => {
      if (!navigator.serviceWorker) return 'unsupported';
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length ? 'registered: ' + regs.map((r) => r.scope).join(', ') : 'none';
    })()
  `)
  console.log(`\nService Worker: ${sw}`)

  // 取り込んだ画像が端末に残っていないことを実データで確認する
  const stored = await evaluate(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('at-quiz');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const stores = [...db.objectStoreNames];
      const rows = await Promise.all(stores.map((name) => new Promise((resolve) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
      })));
      const json = JSON.stringify(rows);
      const binary = /data:image|ArrayBuffer|Blob|"image\\//.test(json);
      const caches_ = await caches.keys();
      return { stores, binary, caches: caches_ };
    })()
  `)
  console.log(`IndexedDB のストア: ${stored.stores.join(', ') || '(なし)'}`)
  console.log(`保存データに画像が含まれるか: ${stored.binary ? 'はい(要調査)' : 'いいえ'}`)
  console.log(`Cache Storage: ${stored.caches.join(', ') || '(なし)'}`)

  cdp.close()
  child.kill()
  await sleep(300)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
  console.log(`\n${OUT_DIR} に保存しました。`)
}

main().catch((err) => {
  console.error('失敗しました:', err.message)
  process.exitCode = 1
})
