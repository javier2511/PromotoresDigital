import { DRAFT_TTL_MS } from '../config/app'
import type { Answers } from './questions'

export interface VisitDraft {
  startedAt: number
  answers: Answers
  position: { lat: number; lng: number; accuracy: number; distance: number } | null
  updatedAt: number
}

const key = (userId: string, clienteKey: string) => `pd.visita.${userId}.${clienteKey}`

export function loadDraft(userId: string, clienteKey: string): VisitDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key(userId, clienteKey)) ?? 'null') as VisitDraft | null
    if (!draft || typeof draft.startedAt !== 'number') return null
    if (Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
      clearDraft(userId, clienteKey)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function saveDraft(userId: string, clienteKey: string, draft: Omit<VisitDraft, 'updatedAt'>) {
  try {
    localStorage.setItem(key(userId, clienteKey), JSON.stringify({ ...draft, updatedAt: Date.now() }))
  } catch {
    /* almacenamiento lleno o bloqueado: el formulario sigue funcionando */
  }
}

export function clearDraft(userId: string, clienteKey: string) {
  try {
    localStorage.removeItem(key(userId, clienteKey))
  } catch {
    /* sin almacenamiento */
  }
}

/** Clientes con una visita empezada y sin terminar. */
export function draftClienteKeys(userId: string): Set<string> {
  const prefix = `pd.visita.${userId}.`
  const keys = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) {
        const clienteKey = k.slice(prefix.length)
        if (loadDraft(userId, clienteKey)) keys.add(clienteKey)
      }
    }
  } catch {
    /* sin almacenamiento */
  }
  return keys
}
