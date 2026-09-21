import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { SignOutButton } from '../components/SignOutButton'

export function HomePage() {
  const projects = useQuery(api.projects.listMyProjects)\n  const isDemoAdmin = useQuery(api.suppliers.isDemoAdmin)
  const createProject = useMutation(api.projects.createProject)
  const launchSample = useAction(api.projects.launchSampleJob)
  const [sampleBusy, setSampleBusy] = useState(false)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState<File[]>([])\n  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setError(null)\n    setSubmitting(true)
    try {
      const attachmentIds: Id<'_storage'>[] = []
      for (const file of files) {
        const uploadUrl = await generateUploadUrl()
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
        attachmentIds.push(storageId)
      }
      await createProject({
        name: String(formData.get('name')),
        jobDescription: String(formData.get('jobDescription') ?? ''),
        location: String(formData.get('location') ?? ''),
        currency: String(formData.get('currency') ?? 'USD'),
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      })
      form.reset()
      setFiles([])
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSample() {\n    setSampleBusy(true)\n    setError(null)\n    try {\n      const id = await launchSample()\n      window.location.href = `/p/${id}`\n    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create sample job.') } finally { setSampleBusy(false) }\n  }\n\n  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Bidwire</h1>
        <div className="flex items-center gap-3">{isDemoAdmin && <Link to="/admin/simulator" className="text-xs text-neutral-400 hover:text-neutral-200">Supplier simulator</Link>}<SignOutButton /></div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        {error && <div role="alert" className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}\n\n        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Projects</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-white"
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
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                Photos or drawings (optional)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
                className="w-full text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </p>
              )}
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
