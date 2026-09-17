import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { RESTRICTED_STATES } from '../shared/compliance'
import { Layout } from './components/Layout'
import { FunnelProvider, useFunnel } from './funnel/FunnelContext'
import { CONTACT_STEP_ID, firstIncompleteStepId, QUIZ_STEPS, stepPath, visibleStepIds, ZIP_STEP_ID } from './funnel/steps'
import { ChoicePage } from './pages/ChoicePage'
import { ContactPage } from './pages/ContactPage'
import { PrivacyPage, TermsPage, ThankYouPage, UnavailablePage } from './pages/InfoPages'
import { ZipPage } from './pages/ZipPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function StepRoute({ landing = false }: { landing?: boolean }) {
  const { stepId = ZIP_STEP_ID } = useParams()
  const { answers } = useFunnel()
  const ids = visibleStepIds(answers)
  const index = ids.indexOf(stepId)
  const firstIncomplete = firstIncompleteStepId(answers)

  // Unknown steps, or steps beyond the first unanswered one, redirect to where the user should be.
  // The first step lives at "/", so its own path redirects there.
  if (!landing && stepId === ZIP_STEP_ID) {
    return <Navigate to={{ pathname: '/', search: window.location.search }} replace />
  }
  if (index < 0 || index > ids.indexOf(firstIncomplete)) {
    return <Navigate to={stepPath(firstIncomplete)} replace />
  }
  // A restricted state blocks every step after ZIP, including via the Back button or a typed URL.
  if (stepId !== ZIP_STEP_ID && RESTRICTED_STATES.includes(answers.state)) {
    return <Navigate to="/unavailable" replace />
  }

  const previousStepId = index > 0 ? ids[index - 1] : null
  const quizStep = QUIZ_STEPS.find((step) => step.id === stepId)

  return (
    <Layout progress={{ current: index + 1, total: ids.length, previousStepId }}>
      {quizStep && <ChoicePage key={stepId} step={quizStep} stepIndex={index} />}
      {stepId === ZIP_STEP_ID && <ZipPage stepIndex={index} />}
      {stepId === CONTACT_STEP_ID && <ContactPage />}
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <FunnelProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<StepRoute landing />} />
          <Route path="/thank-you" element={<Layout><ThankYouPage /></Layout>} />
          <Route path="/unavailable" element={<Layout><UnavailablePage /></Layout>} />
          <Route path="/privacy" element={<Layout><PrivacyPage /></Layout>} />
          <Route path="/terms" element={<Layout><TermsPage /></Layout>} />
          <Route path="/:stepId" element={<StepRoute />} />
        </Routes>
      </FunnelProvider>
    </BrowserRouter>
  )
}
