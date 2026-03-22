import type { BoardState } from './types'

const LOCAL_SESSION_KEY = 'vcad-online.current-project'

export function loadGuestSession(): BoardState | null {
  const raw = window.localStorage.getItem(LOCAL_SESSION_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as BoardState
  } catch {
    window.localStorage.removeItem(LOCAL_SESSION_KEY)
    return null
  }
}

export function saveGuestSession(board: BoardState) {
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(board))
}

export function clearGuestSession() {
  window.localStorage.removeItem(LOCAL_SESSION_KEY)
}