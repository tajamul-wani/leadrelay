import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { RESTRICTED_STATES } from '../../shared/compliance'
import { stateFromZip } from '../../shared/zip'
import { CheckIcon } from '../components/icons'
import { FieldError, fieldClass, primaryButtonClass, StepHeading } from '../components/ui'
import { useFunnel } from '../funnel/FunnelContext'
import { STATE_NAMES } from '../funnel/stateNames'
import { nextStepId, stepPath, ZIP_STEP_ID } from '../funnel/steps'
import { trackStep } from '../lib/pixel'

export function ZipPage({ stepIndex }: { stepIndex: number }) {
  const { answers, setAnswer } = useFunnel()
  const navigate = useNavigate()
  const [zip, setZip] = useState(answers.zip ?? '')
  const [error, setError] = useState<string | null>(null)
  const state = stateFromZip(zip)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!state) {
      setError('Enter a valid 5-digit US ZIP code.')
      return
    }
    setAnswer('state', state)
    const updated = setAnswer('zip', zip)
    if (RESTRICTED_STATES.includes(state)) {
      navigate('/unavailable')
      return
    }
    trackStep(stepIndex + 1)
    navigate(stepPath(nextStepId(ZIP_STEP_ID, updated) ?? ZIP_STEP_ID))
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-6 rounded-2xl bg-brand-50 px-5 py-4 ring-1 ring-brand-100">
        <p className="text-lg leading-snug font-semibold text-balance text-brand-900 sm:text-xl">
          Find out in 2 minutes if you may qualify for Social Security disability benefits.
        </p>
        <p className="mt-1 text-sm text-brand-800 sm:text-base">Free, confidential and no obligation.</p>
      </div>

      <StepHeading title="What is your ZIP code?" description="First, let's check that we can help in your area." />

      <label htmlFor="zip" className="mb-1.5 block text-sm font-semibold text-slate-700">ZIP code</label>
      <input
        id="zip"
        name="zip"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="e.g. 10001"
        maxLength={5}
        value={zip}
        onChange={(e) => {
          setZip(e.target.value.replace(/\D/g, ''))
          setError(null)
        }}
        aria-invalid={error !== null}
        aria-describedby="zip-status"
        className={`${fieldClass} tracking-wider`}
      />
      <div id="zip-status" aria-live="polite" className="min-h-7">
        {error ? (
          <FieldError id="zip-error" message={error} />
        ) : (
          state && (
            RESTRICTED_STATES.includes(state) ? (
              <p className="mt-1.5 text-sm font-medium text-slate-700">{STATE_NAMES[state]}</p>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckIcon className="size-4" strokeWidth={3} /> Help is available in {STATE_NAMES[state]}
              </p>
            )
          )
        )}
      </div>

      <button type="submit" className={`${primaryButtonClass} mt-4`}>Continue</button>
    </form>
  )
}
