import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckIcon, PhoneIcon } from '../components/icons'
import { StepHeading } from '../components/ui'
import { useFunnel } from '../funnel/FunnelContext'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <StepHeading title={title} />
      <div className="space-y-4 leading-relaxed text-slate-700">{children}</div>
    </div>
  )
}

export function ThankYouPage() {
  const location = useLocation()
  const { reset } = useFunnel()
  const firstName = (location.state as { firstName?: string } | null)?.firstName

  // Clear saved answers only once the user has safely arrived here.
  useEffect(() => {
    reset()
  }, [reset])

  const steps = [
    { title: 'We review your answers', text: 'Your details go to a disability specialist who works in your state.' },
    { title: 'A specialist calls you', text: 'Usually within one business day, from a US phone number.' },
    { title: 'You decide what to do next', text: 'The call is free, and there is no obligation.' },
  ]
  const checklist = [
    'Names of doctors, clinics or hospitals that treated you',
    'A list of your current medications',
    'Your recent jobs and the dates you worked them',
    'Any letters you have received from Social Security',
  ]

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex flex-col items-center">
        <span className="mb-5 grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckIcon className="size-8" strokeWidth={2.5} />
        </span>
        <StepHeading
          centered
          title={firstName ? `Thank you, ${firstName}. We have your request.` : 'Thank you. We have your request.'}
          description="Here is what happens next."
        />
      </div>

      <ol className="mt-2 space-y-6">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="relative flex gap-4 not-last:before:absolute not-last:before:top-10 not-last:before:-bottom-6 not-last:before:left-[1.1875rem] not-last:before:w-0.5 not-last:before:bg-slate-200"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 font-semibold text-white ring-4 ring-white">
              {i + 1}
            </span>
            <div className="pt-1.5">
              <p className="font-semibold text-slate-900">{step.title}</p>
              <p className="mt-0.5 text-slate-600">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="prepare" className="mt-8 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
        <h2 id="prepare" className="flex items-center gap-2 font-semibold text-slate-900">
          <PhoneIcon className="size-5 text-brand-600" /> Before the call, have these ready
        </h2>
        <ul className="mt-4 space-y-2.5">
          {checklist.map((item) => (
            <li key={item} className="flex gap-3 text-slate-700">
              <CheckIcon className="mt-1 size-4 shrink-0 text-emerald-600" strokeWidth={3} />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function UnavailablePage() {
  return (
    <Page title="We are not able to help in your state yet">
      <p>
        BenefitBridge does not currently work with residents of your state. We have not asked for or stored any of
        your personal details.
      </p>
      <p>
        You can apply for disability benefits directly with the Social Security Administration at{' '}
        <a href="https://www.ssa.gov/disability" className="font-medium text-brand-700 underline">ssa.gov/disability</a>.
      </p>
      <p>
        <Link to="/zip" className="font-medium text-brand-700 underline">Entered the wrong ZIP code?</Link>
      </p>
    </Page>
  )
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <p>This is a demonstration site. Do not submit real personal information.</p>
      <p>
        Information you submit is used to connect you with disability attorneys and advocates who may contact you as
        described in the consent statement on the form. Contact details are shared with advertising platforms only in
        hashed form, for measuring advertising performance. Answers to eligibility questions are never shared with
        advertising platforms.
      </p>
    </Page>
  )
}

export function TermsPage() {
  return (
    <Page title="Terms of Use">
      <p>This is a demonstration site. It does not provide legal advice and does not guarantee eligibility for benefits.</p>
    </Page>
  )
}
