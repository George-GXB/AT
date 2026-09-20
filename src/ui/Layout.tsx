import type { ReactNode } from 'react'

interface ScreenProps {
  title: string
  /** 左上(戻る等)。省略すると幅だけ確保してタイトルを中央に保つ */
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  /** 画面下部に固定する主要操作 */
  footer?: ReactNode
}

/** 全画面共通の骨格。セーフエリアの処理はここに集約する。 */
export function Screen({ title, left, right, children, footer }: ScreenProps) {
  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-slot">{left}</div>
        <h1>{title}</h1>
        <div className="appbar-slot">{right}</div>
      </header>
      <main className="content">{children}</main>
      {footer && <div className="footer">{footer}</div>}
    </div>
  )
}

export function BackButton({ onClick, label = '戻る' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={onClick}>
      ‹ {label}
    </button>
  )
}

export function Meter({ ratio, tone }: { ratio: number; tone?: 'warn' | 'over' }) {
  const cls = tone === 'over' ? 'meter is-over' : tone === 'warn' ? 'meter is-warn' : 'meter'
  return (
    <div className={cls}>
      <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  )
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error'
  children: ReactNode
}) {
  return <div className={`banner banner-${tone}`}>{children}</div>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  )
}
