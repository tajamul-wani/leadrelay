import { useEffect, useRef, type ReactNode } from 'react'

// Shared form styles so every question, input and button has the same width,
// height, radius and focus treatment.

export const fieldClass =
  'block h-14 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg text-slate-900 transition ' +
  'placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none ' +
  'aria-invalid:border-red-600 disabled:bg-slate-50'

export const primaryButtonClass =
  'flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 text-lg font-semibold text-white ' +
  'shadow-sm transition hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-brand-600 disabled:cursor-wait disabled:bg-brand-500'

/**
 * Step heading. In a single-page app the page never reloads, so on each step the
 * heading receives focus and the document title updates; screen reader users hear
 * the new question instead of silence.
 */
export function StepHeading({
  title,
  description,
  id,
  centered = false,
}: {
  title: string
  description?: ReactNode
  id?: string
  centered?: boolean
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} | BenefitBridge`
    ref.current?.focus({ preventScroll: true })
  }, [title])

  return (
    <div className={centered ? 'mb-6 text-center' : 'mb-6'}>
      <h1 ref={ref} id={id} tabIndex={-1} className="text-2xl leading-tight font-bold tracking-tight text-balance outline-none sm:text-[1.75rem]">
        {title}
      </h1>
      {description && <p className="mt-2 text-base text-slate-600 sm:text-lg">{description}</p>}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return <p id={id} className="mt-1.5 text-sm font-medium text-red-700">{message}</p>
}
