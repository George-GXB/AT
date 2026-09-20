import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { requestPersistence } from './db/storage'
import './styles/global.css'

// iOS Safari は使われていないサイトのデータを退避することがある。
// 起動のたびに永続化を要求しておく(拒否されても通常動作には影響しない)。
void requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
