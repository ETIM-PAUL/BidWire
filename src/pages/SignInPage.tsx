import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useToast } from '../components/ui'

const promises = [
  ['Scope', 'Turn a plain-language job brief into a structured procurement scope.'],
  ['Market', 'Find suppliers, send targeted RFQs and keep every response attached to context.'],
  ['Decision', 'Compare coverage and price, negotiate with approval, then award with guardrails.'],
]

export function SignInPage() {
  const { signIn } = useAuthActions()
  const { toast } = useToast()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSubmitting(true)
    const formData = new FormData(e.currentTarget); formData.set('flow', flow)
    try { await signIn('password', formData) }
    catch { toast('error', flow === 'signIn' ? 'Sign in failed' : 'Account creation failed', 'Check your email and password, then try again.') }
    finally { setSubmitting(false) }
  }

  return <div className="min-h-screen bg-[#070a0d] text-neutral-100 lg:grid lg:grid-cols-[1.12fr_.88fr]">
    <section className="relative hidden overflow-hidden border-r border-white/[.08] lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
      <div className="pointer-events-none absolute -left-24 top-10 h-[28rem] w-[28rem] rounded-full bg-emerald-300/[.08] blur-3xl" /><div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-blue-400/[.05] blur-3xl" />
      <div className="relative"><div className="flex items-center gap-3 text-sm font-bold tracking-[.16em] uppercase"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bw-accent)] text-black shadow-[0_0_28px_rgba(66,230,177,.18)]">B</span> BidWire</div><div className="mt-24 max-w-2xl"><p className="bidwire-eyebrow">Procurement, without the spreadsheet maze</p><h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-.055em] xl:text-7xl">From scope to supplier award, with the evidence connected.</h1><p className="mt-7 max-w-xl text-lg leading-8 text-neutral-400">BidWire keeps AI in the preparation loop and people in control of commercial decisions.</p><div className="mt-12 space-y-3">{promises.map(([label, text], index) => <div key={label} className="flex gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.06] text-xs font-bold text-[var(--bw-accent)]">0{index + 1}</span><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-sm leading-6 text-neutral-500">{text}</p></div></div>)}</div></div></div><p className="relative text-xs text-neutral-600">Human-approved procurement automation for the messy middle between a brief and a purchase order.</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-md">
      <div className="mb-10 lg:hidden"><div className="flex items-center gap-3 text-sm font-bold tracking-[.16em] uppercase"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bw-accent)] text-black">B</span> BidWire</div></div>
      <div className="bidwire-panel rounded-[1.4rem] p-6 sm:p-8"><div className="mb-8"><p className="bidwire-eyebrow">{flow === 'signIn' ? 'Welcome back' : 'Start your workspace'}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">{flow === 'signIn' ? 'Sign in to BidWire' : 'Create your workspace'}</h2><p className="mt-2 text-sm leading-6 text-neutral-500">{flow === 'signIn' ? 'Continue your procurement workflow.' : 'Create an account and launch your first project.'}</p></div>
      <form onSubmit={handleSubmit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Email</span><input name="email" type="email" required placeholder="you@company.com" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Password</span><input name="password" type="password" required minLength={8} placeholder="At least 8 characters" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label><button type="submit" disabled={submitting} className="bidwire-button bidwire-button-primary mt-2 w-full">{submitting ? <><span className="animate-spin">◌</span>{flow === 'signIn' ? 'Signing in…' : 'Creating account…'}</> : flow === 'signIn' ? 'Sign in' : 'Create account'}</button></form>
      <button type="button" onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')} className="mt-5 w-full text-center text-sm text-neutral-500 transition hover:text-neutral-200">{flow === 'signIn' ? 'New to BidWire? Create an account' : 'Already have an account? Sign in'}</button></div>
      <p className="mt-5 text-center text-xs leading-5 text-neutral-700">Your procurement data stays inside your workspace. AI assists with preparation; sending and awarding remain explicit actions.</p>
    </div></section>
  </div>
}
