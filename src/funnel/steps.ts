// Funnel definition. Steps are data: adding, removing or reordering a question
// is a change to this file, not to the components that render it.

export type Answers = Record<string, string>

export type ChoiceStep = {
  id: string
  question: string
  hint?: string
  options: ReadonlyArray<{ value: string; label: string }>
  /** Step is shown only when this returns true. */
  when?: (answers: Answers) => boolean
}

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const

export const QUIZ_STEPS: readonly ChoiceStep[] = [
  {
    id: 'age',
    question: 'What is your age?',
    options: [
      { value: 'under_40', label: 'Under 40' },
      { value: '40_49', label: '40 to 49' },
      { value: '50_54', label: '50 to 54' },
      { value: '55_63', label: '55 to 63' },
      { value: '64_plus', label: '64 or older' },
    ],
  },
  {
    id: 'benefits',
    question: 'Are you currently receiving disability benefits?',
    options: [
      { value: 'none', label: 'No, not receiving any' },
      { value: 'ssdi', label: 'Yes, SSDI (Social Security Disability Insurance)' },
      { value: 'ssi', label: 'Yes, SSI (Supplemental Security Income)' },
      { value: 'both', label: 'Yes, both SSDI and SSI' },
    ],
  },
  {
    id: 'work_hours',
    question: 'How many hours a week are you working right now?',
    options: [
      { value: 'not_working', label: 'I am not working' },
      { value: '20_or_less', label: '20 hours or less' },
      { value: 'over_20', label: 'More than 20 hours' },
    ],
  },
  {
    id: 'work_history',
    question: 'In the last 10 years, about how many years did you work?',
    hint: 'Social Security Disability Insurance depends on your work history.',
    options: [
      { value: 'under_2', label: 'Less than 2 years' },
      { value: '2_4', label: '2 to 4 years' },
      { value: '4_6', label: '4 to 6 years' },
      { value: 'over_6', label: 'More than 6 years' },
    ],
  },
  {
    id: 'duration',
    question: 'Do you expect your condition to keep you out of work for at least 12 months?',
    options: yesNo,
  },
  {
    id: 'treatment',
    question: 'Are you seeing a doctor or taking prescribed medication for your condition?',
    options: yesNo,
  },
  {
    id: 'applied',
    question: 'Have you already applied for disability benefits?',
    options: yesNo,
  },
  {
    id: 'application_status',
    question: 'What is the status of your application?',
    options: [
      { value: 'pending', label: 'Still waiting for a decision' },
      { value: 'denied', label: 'It was denied' },
    ],
    when: (answers) => answers.applied === 'yes',
  },
  {
    id: 'represented',
    question: 'Is an attorney or advocate already helping you with your application?',
    options: yesNo,
    when: (answers) => answers.applied === 'yes',
  },
  {
    id: 'assets',
    question: 'What is the total value of your savings and assets?',
    hint: 'Do not include your home or one vehicle.',
    options: [
      { value: 'under_2000', label: 'Less than $2,000' },
      { value: 'over_2000', label: 'More than $2,000' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    id: 'marital_status',
    question: 'What is your marital status?',
    hint: 'Supplemental Security Income can depend on household income.',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
      { value: 'separated', label: 'Separated' },
      { value: 'divorced', label: 'Divorced' },
      { value: 'widowed', label: 'Widowed' },
    ],
  },
]

export const ZIP_STEP_ID = 'zip'
export const CONTACT_STEP_ID = 'contact'

/**
 * All step IDs in order. ZIP comes first so people in restricted states learn
 * straight away that we cannot help, before answering any health questions.
 */
export function visibleStepIds(answers: Answers): string[] {
  return [ZIP_STEP_ID, ...QUIZ_STEPS.filter((step) => !step.when || step.when(answers)).map((step) => step.id), CONTACT_STEP_ID]
}

/** URL path for a step. The first step is the landing page, so it has no path segment. */
export function stepPath(stepId: string): string {
  return stepId === ZIP_STEP_ID ? '/' : `/${stepId}`
}

export function nextStepId(currentId: string, answers: Answers): string | null {
  const ids = visibleStepIds(answers)
  const index = ids.indexOf(currentId)
  return index >= 0 && index < ids.length - 1 ? ids[index + 1] : null
}

/** First step the user has not completed; used to stop users skipping ahead via the URL. */
export function firstIncompleteStepId(answers: Answers): string {
  const ids = visibleStepIds(answers)
  return ids.find((id) => !answers[id]) ?? CONTACT_STEP_ID
}

/** Drops answers to quiz steps that are no longer visible after an earlier answer changed. */
export function pruneAnswers(answers: Answers): Answers {
  const hidden = new Set(QUIZ_STEPS.filter((step) => step.when && !step.when(answers)).map((step) => step.id))
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !hidden.has(id)))
}

/**
 * Non-blocking qualification tier. Mirrors the basic SSDI screening criteria:
 * not already receiving benefits, not working substantially, a condition expected
 * to last 12+ months, under treatment, and not already represented.
 */
export function isQualified(answers: Answers): boolean {
  return (
    answers.benefits === 'none' &&
    answers.work_hours !== 'over_20' &&
    answers.duration === 'yes' &&
    answers.treatment === 'yes' &&
    answers.represented !== 'yes'
  )
}
