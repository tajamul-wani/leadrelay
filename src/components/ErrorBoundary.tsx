import { Component, type ErrorInfo, type ReactNode } from 'react'

// Shows a recovery screen instead of a blank page if rendering fails.

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Funnel render error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center text-slate-800">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-slate-600">Your answers are saved. Reload the page to continue where you left off.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white"
        >
          Reload
        </button>
      </div>
    )
  }
}
