import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useToast } from '../components/ui'

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

  return <div className="min-h-screen bg-[#070908] text-neutral-100 lg:grid lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden border-r border-white/10 lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,.16),transparent_32rem)]" />
      <div className="relative"><div className="flex items-center gap-2 text-sm font-bold tracking-[.18em] uppercase"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-black">B</span> BidWire</div>
        <div className="mt-24 max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-400">Procurement control for contractors</p><h1 className="mt-5 text-5xl font-semibold tracking-[-.04em] xl:text-6xl">Turn supplier replies into a decision you can trust.</h1><p className="mt-6 max-w-lg text-base leading-7 text-neutral-400">Collect quotes, compare real prices, negotiate with approval, and award the job without losing the thread.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">{['Live quote matrix','Human-approved email','Award-ready totals'].map((item) => <div key={item} className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm text-neutral-300"><span className="text-amber-400">✓</span><p className="mt-2">{item}</p></div>)}</div>
        </div>
      </div>
      <p className="relative text-xs text-neutral-600">Built for the messy middle between a job description and a purchase order.</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <div className="mb-10 lg:hidden"><div className="flex items-center gap-2 text-sm font-bold tracking-[.18em] uppercase"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-black">B</span> BidWire</div></div>
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-400">{flow === 'signIn' ? 'Welcome back' : 'Get started'}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{flow === 'signIn' ? 'Sign in to BidWire' : 'Create your workspace'}</h2><p className="mt-2 text-sm text-neutral-500">{flow === 'signIn' ? 'Pick up where your procurement workflow left off.' : 'Set up your workspace and start your first project.'}</p></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Email</span><input name="email" type="email" required placeholder="you@company.com" className="w-full rounded-xl border border-white/10 bg-white/[.035] px-3.5 py-3 text-sm placeholder:text-neutral-700 focus:border-amber-400/50 focus:bg-white/[.05] focus:outline-none" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Password</span><input name="password" type="password" required minLength={8} placeholder="At least 8 characters" className="w-full rounded-xl border border-white/10 bg-white/[.035] px-3.5 py-3 text-sm placeholder:text-neutral-700 focus:border-amber-400/50 focus:bg-white/[.05] focus:outline-none" /></label>
          <button type="submit" disabled={submitting} className="bidwire-button bidwire-button-primary mt-2 w-full">{submitting ? <><span className="animate-spin">◌</span>{flow === 'signIn' ? 'Signing in…' : 'Creating account…'}</> : flow === 'signIn' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button type="button" onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')} className="mt-5 w-full text-center text-sm text-neutral-500 transition hover:text-neutral-200">{flow === 'signIn' ? "New to BidWire? Create an account" : 'Already have an account? Sign in'}</button>
      </div>
    </section>
  </div>
}
