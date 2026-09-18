import { expect, test, type Page, type Route } from '@playwright/test'

const LANDING = '/?test=1&utm_source=facebook&utm_campaign=e2e&fbclid=e2eclick'

type Submission = Record<string, any>

/** Captures submissions and controls what the API returns, so tests need no backend. */
async function stubApi(page: Page, statuses: number[] = [200]) {
  const submissions: Submission[] = []
  let call = 0
  await page.route('**/api/lead', async (route: Route) => {
    submissions.push(JSON.parse(route.request().postData() ?? '{}'))
    const status = statuses[Math.min(call++, statuses.length - 1)]
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status < 400 ? { ok: true } : { ok: false, message: 'Service unavailable.' }),
    })
  })
  return submissions
}

test.beforeEach(async ({ page }) => {
  // The Pixel is third-party and must never be contacted from tests.
  await page.route(/facebook\.(net|com)/, (route) => route.abort())
})

async function answerZip(page: Page, zip: string) {
  await page.getByLabel('ZIP code').fill(zip)
  await page.getByRole('button', { name: 'Continue' }).click()
}

/**
 * Answers one question and waits for the next step's URL. Consecutive yes/no
 * questions share button labels, so each answer must settle before the next.
 */
async function answer(page: Page, label: string, nextStepId: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${nextStepId}$`))
}

async function completeQuiz(page: Page, benefits: 'none' | 'ssdi' = 'none') {
  await answerZip(page, '10001')
  await expect(page).toHaveURL(/\/age$/)
  await answer(page, '50 to 54', 'benefits')
  await answer(page, benefits === 'none' ? 'No, not receiving any' : 'Yes, SSDI (Social Security Disability Insurance)', 'work_hours')
  await answer(page, 'I am not working', 'work_history')
  await answer(page, 'More than 6 years', 'duration')
  await answer(page, 'Yes', 'treatment')
  await answer(page, 'Yes', 'applied')
  await answer(page, 'No', 'assets')
  await answer(page, 'Less than $2,000', 'marital_status')
  await answer(page, 'Single', 'contact')
}

async function fillContact(page: Page) {
  // Exact labels: the consent checkbox's label is the full consent paragraph,
  // which also contains the words "email" and "phone number".
  await page.getByLabel('First name', { exact: true }).fill('Jane')
  await page.getByLabel('Last name', { exact: true }).fill('Smith')
  await page.getByLabel('Email', { exact: true }).fill('jane.smith@example.com')
  await page.getByLabel('Mobile phone', { exact: true }).fill('4155552671')
}

test('submits a qualified lead with attribution, consent and a shared event id', async ({ page }) => {
  const submissions = await stubApi(page)
  await page.goto(LANDING)
  await completeQuiz(page)
  await fillContact(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /free case review/i }).click()

  await expect(page).toHaveURL(/\/thank-you$/)
  await expect(page.getByRole('heading', { name: /Thank you, Jane/ })).toBeVisible()

  expect(submissions).toHaveLength(1)
  const lead = submissions[0]
  expect(lead.lead_id).toBe(lead.event_id)
  expect(lead.is_test).toBe(true)
  expect(lead.contact).toMatchObject({ email: 'jane.smith@example.com', zip: '10001', state: 'NY' })
  expect(lead.quiz).toMatchObject({ qualified: true })
  expect(lead.quiz.answers).toMatchObject({ age: '50_54', benefits: 'none', applied: 'no' })
  expect(lead.consent.given).toBe(true)
  expect(lead.consent.text).toContain('Get my free case review')
  expect(lead.attribution).toMatchObject({ utm_source: 'facebook', utm_campaign: 'e2e', fbclid: 'e2eclick' })
  expect(lead.attribution.fbc).toContain('e2eclick')
})

test('marks a lead that fails the screening criteria as not qualified', async ({ page }) => {
  const submissions = await stubApi(page)
  await page.goto(LANDING)
  await completeQuiz(page, 'ssdi') // already receiving benefits
  await fillContact(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /free case review/i }).click()

  await expect(page).toHaveURL(/\/thank-you$/)
  expect(submissions[0].quiz.qualified).toBe(false)
})

test('stops a restricted state at the first question without collecting anything', async ({ page }) => {
  const submissions = await stubApi(page)
  await page.goto(LANDING)
  await answerZip(page, '90210')

  await expect(page).toHaveURL(/\/unavailable$/)
  await expect(page.getByRole('heading', { name: /not able to help/i })).toBeVisible()

  // Later steps stay blocked even when typed directly.
  await page.goto('/contact')
  await expect(page).toHaveURL(/\/unavailable$/)
  expect(submissions).toHaveLength(0)
})

test('requires valid contact details and explicit consent before sending anything', async ({ page }) => {
  const submissions = await stubApi(page)
  await page.goto(LANDING)
  await completeQuiz(page)

  await page.getByRole('button', { name: /free case review/i }).click()
  await expect(page.getByText('Enter your first name.')).toBeVisible()
  await expect(page.getByText('Enter a valid 10-digit US phone number.')).toBeVisible()

  await fillContact(page)
  await page.getByRole('button', { name: /free case review/i }).click()
  await expect(page.getByText('Please check the box to agree to be contacted.')).toBeVisible()
  expect(submissions).toHaveLength(0)
})

test('sends visitors who jump ahead back to their first unanswered question', async ({ page }) => {
  await stubApi(page)
  await page.goto('/marital_status')
  await expect(page).toHaveURL(/\/$|\/\?/)
  await expect(page.getByRole('heading', { name: 'What is your ZIP code?' })).toBeVisible()
})

test('keeps a lead in the outbox when the API fails and resends it on the next visit', async ({ page }) => {
  const failed = await stubApi(page, [503])
  await page.goto(LANDING)
  await completeQuiz(page)
  await fillContact(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /free case review/i }).click()

  await expect(page.getByRole('alert')).toContainText(/could not send/i, { timeout: 20_000 })
  const stored = await page.evaluate(() => localStorage.getItem('leadrelay.outbox'))
  expect(stored).toBeTruthy()
  const leadId = JSON.parse(stored!).lead_id
  expect(failed.length).toBeGreaterThan(1) // retried before giving up

  // Next visit: the API is healthy again and the stored lead is resent unchanged.
  const resent = await stubApi(page, [200])
  await page.goto(LANDING)
  await expect.poll(() => resent.length).toBeGreaterThan(0)
  expect(resent[0].lead_id).toBe(leadId)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('leadrelay.outbox'))).toBeNull()
})
