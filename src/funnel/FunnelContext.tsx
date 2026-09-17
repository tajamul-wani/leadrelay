import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { pruneAnswers, type Answers } from './steps'

// Funnel answers live in sessionStorage so a refresh does not lose progress,
// and a new tab or session starts clean.

const STORAGE_KEY = 'leadrelay.answers'

type FunnelContextValue = {
  answers: Answers
  setAnswer: (stepId: string, value: string) => Answers
  reset: () => void
}

const FunnelContext = createContext<FunnelContextValue | null>(null)

function load(): Answers {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Answers
  } catch {
    return {}
  }
}

export function FunnelProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Answers>(load)

  const setAnswer = useCallback((stepId: string, value: string) => {
    const next = pruneAnswers({ ...load(), [stepId]: value })
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setAnswers(next)
    return next
  }, [])

  const reset = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setAnswers({})
  }, [])

  const value = useMemo(() => ({ answers, setAnswer, reset }), [answers, setAnswer, reset])
  return <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFunnel(): FunnelContextValue {
  const context = useContext(FunnelContext)
  if (!context) throw new Error('useFunnel must be used inside FunnelProvider')
  return context
}
