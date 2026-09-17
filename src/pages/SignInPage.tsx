import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import type { FormEvent } from 'react'

export function SignInPage() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    formData.set('flow', flow)
    try {
      await signIn('password', formData)
    } catch {
      setError('Could not sign in. Check your email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bidwire</h1>
          <p className="text-neutral-400 text-sm">
            {flow === 'signIn' ? 'Sign in to your account' : 'Create an account'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password"
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-100 text-neutral-900 py-2 text-sm font-medium disabled:opacity-50"
          >
            {flow === 'signIn' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')}
          className="w-full text-center text-sm text-neutral-400 hover:text-neutral-200"
        >
          {flow === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
