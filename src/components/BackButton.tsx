import { useNavigate } from 'react-router'
import { ChevronLeftIcon } from './icons'

export function BackButton({ to }: { to: string | null }) {
  const navigate = useNavigate()
  if (!to) return null
  return (
    <button
      type="button"
      onClick={() => navigate(`/${to}`)}
      className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      <ChevronLeftIcon className="size-4" /> Back
    </button>
  )
}
