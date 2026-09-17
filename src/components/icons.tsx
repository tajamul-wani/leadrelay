import type { SVGProps } from 'react'

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)

export const XIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export const ChevronLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><path d="M15 18l-6-6 6-6" /></svg>
)

export const ShieldIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
)

export const ClockIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)

export const PhoneIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>
)

export const Spinner = ({ className = '' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)
