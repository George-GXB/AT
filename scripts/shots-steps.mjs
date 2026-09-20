/** shots.mjs が順に実行する操作。画面ごとに「操作 → 撮影」を並べる。 */

const SAMPLE = [
  '第3章 植物のはたらき',
  '・光合成とは、植物が光エネルギーを使って二酸化炭素と水から養分をつくる働きである。',
  '・呼吸とは、細胞が養分を分解してエネルギーを取り出す働きである。',
  '・蒸散とは、植物の体内の水分が水蒸気となって気孔から出ていく現象である。',
  '・道管：根から吸収した水や養分を運ぶ管',
  '・師管：葉でつくられた養分を運ぶ管',
  '葉緑体は、光合成が行われる緑色の粒である。',
  '気孔は葉の裏側に多く分布しており、蒸散の量を調節している。',
].join('\n')

/** ページ側に置くヘルパー(文言でボタンを探して押す) */
const HELPERS = `
  window.__tap = (text) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
    if (!el) throw new Error('見つかりません: ' + text);
    el.click();
    return true;
  };
  window.__fill = (selector, value) => {
    const el = document.querySelector(selector);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
`

const tap = (text) => `${HELPERS} window.__tap(${JSON.stringify(text)})`

export const steps = [
  { shot: '1-home-empty' },

  { run: (evaluate) => evaluate(tap('画像・テキストから問題を作る')), shot: '2-import' },

  {
    run: (evaluate) => evaluate(`${HELPERS} window.__fill('textarea', ${JSON.stringify(SAMPLE)})`),
    shot: '3-import-filled',
  },

  { run: (evaluate) => evaluate(tap('この内容から問題を作る')), shot: '4-review' },

  { run: (evaluate) => evaluate(tap('編集')), shot: '5-review-edit' },

  { run: (evaluate) => evaluate(tap('完了')) },

  { run: (evaluate) => evaluate(tap('問を保存する')), shot: '6-home' },

  // 保存した問題集をタップして出題へ
  {
    run: (evaluate) =>
      evaluate(`document.querySelector('.content .card').click(); true`),
    shot: '7-quiz',
  },

  {
    run: (evaluate) => evaluate(`document.querySelectorAll('.choice')[1].click(); true`),
    shot: '8-quiz-answered',
  },

  // 残りを順に答えて結果画面まで進める
  {
    run: async (evaluate, sleep) => {
      for (let i = 0; i < 30; i++) {
        const done = await evaluate(`
          (() => {
            const next = [...document.querySelectorAll('.footer button')]
              .find((b) => /次の問題へ|結果を見る/.test(b.textContent));
            if (!next) return 'no-next';
            const last = next.textContent.includes('結果を見る');
            next.click();
            return last ? 'finished' : 'continue';
          })()
        `)
        await sleep(120)
        if (done === 'finished' || done === 'no-next') break
        // 2問目以降は先頭の選択肢を選ぶ(不正解を混ぜて結果画面を確認する)
        await evaluate(`document.querySelectorAll('.choice')[0].click(); true`)
        await sleep(120)
      }
    },
    shot: '9-result',
  },

  { run: (evaluate) => evaluate(tap('ホームに戻る')) },
  { run: (evaluate) => evaluate(tap('設定')), shot: '10-settings' },

  // OCR は言語データの読み込みに時間がかかるため、OCR=1 のときだけ通す。
  // 画面内で日本語の画像を作って file input に流し込み、実経路を確認する。
  ...(process.env.OCR === '1'
    ? [
        { run: (evaluate) => evaluate(tap('戻る')) },
        { run: (evaluate) => evaluate(tap('画像・テキストから問題を作る')) },
        {
          run: async (evaluate, sleep) => {
            await evaluate(`
              (async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 1000; canvas.height = 340;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#000000';
                ctx.font = '40px "Yu Gothic", "Meiryo", "MS Gothic", sans-serif';
                ctx.fillText('光合成とは、植物が養分をつくる働きである。', 40, 80);
                ctx.fillText('呼吸とは、養分を分解する働きである。', 40, 160);
                ctx.fillText('蒸散とは、水が気孔から出る現象である。', 40, 240);
                ctx.fillText('葉緑体とは、光合成を行う粒である。', 40, 320);
                const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
                const transfer = new DataTransfer();
                transfer.items.add(new File([blob], 'page.png', { type: 'image/png' }));
                const input = document.querySelector('input[type=file]');
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `)
            // 言語データの読み込みと認識の完了を待つ
            for (let i = 0; i < 120; i++) {
              await sleep(1000)
              const state = await evaluate(`
                (() => {
                  const busy = !!document.querySelector('.meter');
                  const text = document.querySelector('textarea')?.value ?? '';
                  const error = [...document.querySelectorAll('.banner-error')].map((e) => e.textContent).join('');
                  return { busy, length: text.length, error };
                })()
              `)
              if (state.error) throw new Error(`OCR エラー: ${state.error}`)
              if (!state.busy && state.length > 0) break
            }
            const text = await evaluate(`document.querySelector('textarea').value`)
            console.log('\n--- OCR 結果 ---\n' + text + '\n----------------')
          },
          shot: '11-ocr',
        },
        { run: (evaluate) => evaluate(tap('この内容から問題を作る')), shot: '12-ocr-review' },
      ]
    : []),
]
