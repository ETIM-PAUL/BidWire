import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import { SignOutButton } from '../components/SignOutButton'

export function HomePage() {
  const projects = useQuery(api.projects.listMyProjects)
  const createProject = useMutation(api.projects.createProject)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setSubmitting(true)
    try {
      await createProject({
        name: String(formData.get('name')),
        jobDescription: String(formData.get('jobDescription') ?? ''),
        location: String(formData.get('location') ?? ''),
        currency: String(formData.get('currency') ?? 'USD'),
      })
      form.reset()
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Bidwire</h1>
        <SignOutButton />
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Projects</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium"
          >
            {showForm ? 'Cancel' : 'New project'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-lg border border-neutral-800 p-4"
          >
            <input
              name="name"
              required
              placeholder="Project name"
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
            <textarea
              name="jobDescription"
              required
              placeholder="Job description"
              rows={4}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                name="location"
                required
                placeholder="Location"
                className="rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
              <input
                name="currency"
                required
                placeholder="Currency (e.g. USD)"
                defaultValue="USD"
                className="rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Create project
            </button>
          </form>
        )}

        <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
          {projects === undefined && (
            <li className="px-4 py-3 text-sm text-neutral-500">Loading…</li>
          )}
          {projects?.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-500">No projects yet.</li>
          )}
          {projects?.map((p) => (
            <li key={p._id}>
              <Link to={`/p/${p._id}`} className="block px-4 py-3 hover:bg-neutral-900">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-neutral-500 line-clamp-1">{p.location}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
