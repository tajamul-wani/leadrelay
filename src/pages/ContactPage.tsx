import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { CONSENT_TEXT, SUBMIT_BUTTON_LABEL } from '../../shared/compliance'
import { normalizeUsPhone } from '../../shared/lead'
import { CheckIcon, ShieldIcon, Spinner } from '../components/icons'
import { FieldError, fieldClass, primaryButtonClass, StepHeading } from '../components/ui'
import { useFunnel } from '../funnel/FunnelContext'
import { buildLead, submitLead, type ContactInput } from '../funnel/submit'

type Field = keyof ContactInput | 'consent'
type Errors = Partial<Record<Field, string>>

const FIELDS: ReadonlyArray<{
  name: keyof ContactInput
  label: string
  type: string
  autoComplete: string
  placeholder: string
  inputMode?: 'email' | 'tel'
}> = [
  { name: 'first_name', label: 'First name', type: 'text', autoComplete: 'given-name', placeholder: 'Jane' },
  { name: 'last_name', label: 'Last name', type: 'text', autoComplete: 'family-name', placeholder: 'Smith' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', placeholder: 'jane@example.com', inputMode: 'email' },
  { name: 'phone', label: 'Mobile phone', type: 'tel', autoComplete: 'tel-national', placeholder: '(555) 123-4567', inputMode: 'tel' },
]

function validate(values: ContactInput, consent: boolean): Errors {
  const errors: Errors = {}
  if (!values.first_name.trim()) errors.first_name = 'Enter your first name.'
  if (!values.last_name.trim()) errors.last_name = 'Enter your last name.'
  if (!z.email().safeParse(values.email.trim().toLowerCase()).success) errors.email = 'Enter a valid email address.'
  if (!normalizeUsPhone(values.phone)) errors.phone = 'Enter a valid 10-digit US phone number.'
  if (!consent) errors.consent = 'Please check the box to agree to be contacted.'
  return errors
}

/** Formats digits as (555) 123-4567 while typing. */
function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function ContactPage() {
  const { answers } = useFunnel()
  const navigate = useNavigate()
  const [values, setValues] = useState<ContactInput>({ first_name: '', last_name: '', email: '', phone: '' })
  const [consent, setConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')
  const [slow, setSlow] = useState(false)
  const sending = status === 'sending'

  useEffect(() => {
    if (!sending) return
    const timer = setTimeout(() => setSlow(true), 4000)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [sending])

  function update(name: keyof ContactInput, value: string) {
    setValues((v) => ({ ...v, [name]: name === 'phone' ? formatPhone(value) : value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values, consent)
    setErrors(found)
    const firstInvalid = Object.keys(found)[0]
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }

    setStatus('sending')
    const result = await submitLead(buildLead(answers, values, honeypot))
    if (result.ok) {
      navigate('/thank-you', { replace: true, state: { firstName: values.first_name.trim() } })
      return
    }
    setStatus('error')
    setSubmitError(result.message)
  }

  return (
    <div className="relative">
      <StepHeading title="Last step: where can we reach you?" description="A disability specialist will review your answers and call you. It is free." />

      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={sending}>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name} className="mb-1.5 block text-sm font-semibold text-slate-700">{field.label}</label>
              <div className="relative">
                {field.name === 'phone' && (
                  <span className="pointer-events-none absolute inset-y-2 left-0 flex items-center border-r-2 border-slate-200 pr-3 pl-4 text-lg text-slate-500">
                    +1
                  </span>
                )}
                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  inputMode={field.inputMode}
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  value={values[field.name]}
                  onChange={(e) => update(field.name, e.target.value)}
                  disabled={sending}
                  aria-invalid={errors[field.name] !== undefined}
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  className={`${fieldClass} ${field.name === 'phone' ? 'pl-17' : ''}`}
                />
              </div>
              <FieldError id={`${field.name}-error`} message={errors[field.name]} />
            </div>
          ))}
        </div>

        {/* Honeypot: hidden from people and assistive technology, filled only by bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="leadrelay_hp">Leave this field empty</label>
          <input id="leadrelay_hp" name="leadrelay_hp" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div>
          <label
            className={`flex cursor-pointer gap-3 rounded-2xl border-2 px-4 py-3 transition ${
              errors.consent ? 'border-red-600 bg-red-50/40' : consent ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200 hover:border-brand-400'
            }`}
          >
            <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                disabled={sending}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  if (e.target.checked) setErrors((er) => ({ ...er, consent: undefined }))
                }}
                aria-invalid={errors.consent !== undefined}
                aria-describedby={errors.consent ? 'consent-error' : undefined}
                className="peer size-6 cursor-pointer appearance-none rounded-md border-2 border-slate-300 bg-white checked:border-brand-600 checked:bg-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              />
              <CheckIcon className="pointer-events-none absolute size-4 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3.5} />
            </span>
            <span className="text-[0.8rem] leading-relaxed text-slate-700">{CONSENT_TEXT}</span>
          </label>
          <FieldError id="consent-error" message={errors.consent} />
        </div>

        {status === 'error' && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{submitError}</p>
        )}

        <div className="space-y-3">
          <button type="submit" disabled={sending} className={primaryButtonClass}>{SUBMIT_BUTTON_LABEL}</button>
          <p className="flex items-center justify-center gap-1.5 text-sm text-slate-600">
            <ShieldIcon className="size-4" /> Your details are sent over an encrypted connection
          </p>
        </div>
      </form>

      {sending && (
        <div
          role="status"
          aria-live="polite"
          className="absolute -inset-2 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/90 text-center backdrop-blur-sm"
        >
          <Spinner className="size-12 text-brand-600" />
          <p className="mt-5 text-xl font-semibold text-slate-900">Sending your details securely</p>
          <p className="mt-1 text-slate-600">
            {slow ? 'This is taking a little longer than usual. Please keep this page open.' : 'This only takes a moment.'}
          </p>
        </div>
      )}
    </div>
  )
}
