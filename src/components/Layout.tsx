import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BackButton } from './BackButton'
import { ClockIcon, ShieldIcon } from './icons'

type Progress = { current: number; total: number; previousStepId: string | null }

export function Layout({ children, progress }: { children: ReactNode; progress?: Progress }) {
  // Progress shows completed steps, so the last step is not already at 100%.
  const percent = progress ? Math.max(4, Math.round(((progress.current - 1) / progress.total) * 100)) : 0

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight text-slate-900">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">BB</span>
            BenefitBridge
          </Link>
          <ul className="flex items-center gap-4 text-sm text-slate-600">
            <li className="hidden items-center gap-1.5 sm:flex"><ShieldIcon className="size-4 text-brand-600" /> Free and confidential</li>
            <li className="flex items-center gap-1.5"><ClockIcon className="size-4 text-brand-600" /> 2 minutes</li>
          </ul>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-6 sm:py-8">
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {progress && (
            <div className="border-b border-slate-100 px-5 pt-4 pb-3 sm:px-8">
              <div className="flex h-8 items-center justify-between">
                <BackButton to={progress.previousStepId} />
                <span className="ml-auto text-sm font-medium text-slate-600">
                  Step {progress.current} of {progress.total}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
          <div className="px-5 py-6 sm:px-8 sm:py-8">{children}</div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl space-y-2 px-5 pb-6 text-xs leading-relaxed text-slate-600 sm:px-8">
        <p>
          BenefitBridge is a private service. It is not affiliated with or endorsed by the Social Security Administration
          or any government agency. We connect people with independent disability attorneys and advocates and do not
          provide legal advice.
        </p>
        <p className="flex gap-4">
          <Link to="/privacy" className="underline hover:text-slate-900">Privacy Policy</Link>
          <Link to="/terms" className="underline hover:text-slate-900">Terms of Use</Link>
        </p>
      </footer>
    </div>
  )
}
