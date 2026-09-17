import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckIcon } from '../components/icons'
import { StepHeading } from '../components/ui'
import { useFunnel } from '../funnel/FunnelContext'
import { nextStepId, stepPath, type ChoiceStep } from '../funnel/steps'
import { trackStep } from '../lib/pixel'

type Props = {
  step: ChoiceStep
  stepIndex: number
}

// Delay before advancing, so the selected state is visible as feedback.
const ADVANCE_DELAY_MS = 250
// Options longer than this stay in a single column so labels never wrap awkwardly.
const TWO_COLUMN_MAX_LABEL = 28

export function ChoicePage({ step, stepIndex }: Props) {
  const { answers, setAnswer } = useFunnel()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<string | null>(null)
  const selectedValue = picked ?? answers[step.id]
  const twoColumns = step.options.every((o) => o.label.length <= TWO_COLUMN_MAX_LABEL)

  function choose(value: string) {
    if (picked) return
    setPicked(value)
    const updated = setAnswer(step.id, value)
    trackStep(stepIndex + 1)
    setTimeout(() => {
      const next = nextStepId(step.id, updated)
      if (next) navigate(stepPath(next))
    }, ADVANCE_DELAY_MS)
  }

  return (
    <div>
      <StepHeading id="question" title={step.question} description={step.hint} />

      <div role="group" aria-labelledby="question" className={`grid gap-3 ${twoColumns ? 'sm:grid-cols-2' : ''}`}>
        {step.options.map((option) => {
          const selected = selectedValue === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              aria-pressed={selected}
              className={`group flex min-h-14 w-full items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left text-lg font-medium transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:scale-[0.99] ${
                selected
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : 'border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50/40'
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${
                  selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 group-hover:border-brand-400'
                }`}
              >
                {selected && <CheckIcon className="size-3.5" strokeWidth={3.5} />}
              </span>
              <span className="flex-1">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
