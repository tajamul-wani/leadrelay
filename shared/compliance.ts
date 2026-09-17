// Compliance settings shared by the funnel and the API.

/** States where leads are not accepted. Enforced in the funnel and again in the API. */
export const RESTRICTED_STATES: readonly string[] = ['CA']

export const SUBMIT_BUTTON_LABEL = 'Get my free case review'

export const CONSENT_VERSION = 'tcpa-2026-09-v2'

/**
 * Consent language used as the label of a required, unchecked checkbox directly
 * above the submit button. The full string and version are stored with each lead.
 */
export const CONSENT_TEXT =
  `By checking this box and clicking "${SUBMIT_BUTTON_LABEL}", I agree that BenefitBridge and its partner ` +
  'disability law firms and advocates may contact me about my disability benefits claim at the phone number ' +
  'and email I provided, including by calls and text messages sent using automated technology or prerecorded ' +
  'voice. Consent is not a condition of receiving any service. Message and data rates may apply. Reply STOP to ' +
  'opt out. I also agree to the Privacy Policy and Terms of Use.'
