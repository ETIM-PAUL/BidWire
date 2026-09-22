import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { SignOutButton } from '../components/SignOutButton'
import { EmptyState, Skeleton, StatusPill, useToast } from '../components/ui'

export function HomePage() {
  const projects = useQuery(api.projects.listMyProjects)
  const isDemoAdmin = useQuery(api.suppliers.isDemoAdminQuery)
  const createProject = useMutation(api.projects.createProject)
  const launchSample = useAction(api.projects.launchSampleJob)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false); const [submitting, setSubmitting] = useState(false); const [files, setFiles] = useState<File[]>([])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); setSubmitting(true)
    try {
      const attachmentIds: Id<'_storage'>[] = []
      for (const file of files) { const uploadUrl = await generateUploadUrl(); const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }); const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }; attachmentIds.push(storageId) }
      await createProject({ name: String(data.get('name')), jobDescription: String(data.get('jobDescription') ?? ''), location: String(data.get('location') ?? ''), currency: String(data.get('currency') ?? 'USD'), attachmentIds: attachmentIds.length ? attachmentIds : undefined })
      form.reset(); setFiles([]); setShowForm(false); toast('success', 'Project created', 'Your BOQ workflow is now running.')
    } catch (error) { toast('error', 'Could not create project', error instanceof Error ? error.message : 'Please try again.') }
    finally { setSubmitting(false) }
  }

  async function handleSample() {
    setSubmitting(true)
    try { await launchSample(); toast('success', 'Sample job launched', 'A bathroom renovation project is being prepared.') }
    catch (error) { toast('error', 'Sample job failed', error instanceof Error ? error.message : 'Please try again.') }
    finally { setSubmitting(false) }
  }

  return <div className="min-h-screen bg-[#070908] text-neutral-100">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070908]/90 px-4 backdrop-blur-xl sm:px-6"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between"><Link to="/" className="flex items-center gap-2 text-sm font-bold tracking-[.16em] uppercase"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-black">B</span> BidWire</Link><div className="flex items-center gap-3">{isDemoAdmin && <Link to="/admin/simulator" className="hidden text-xs text-neutral-500 hover:text-neutral-200 sm:block">Supplier simulator</Link>}<SignOutButton /></div></div></header>
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-400">Procurement workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em] sm:text-4xl">Projects</h1><p className="mt-2 text-sm text-neutral-500">Move from job description to supplier quotes, negotiation and award.</p></div><div className="flex gap-2"><button onClick={() => void handleSample()} disabled={submitting} className="bidwire-button bidwire-button-secondary">{submitting ? 'Preparing…' : 'Try a sample job'}</button><button onClick={() => setShowForm((v) => !v)} className="bidwire-button bidwire-button-primary">{showForm ? 'Close form' : 'New project'}</button></div></div>

      {showForm && <form onSubmit={handleSubmit} className="my-6 grid gap-5 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><div><p className="text-sm font-semibold">Start a procurement project</p><p className="mt-1 text-xs text-neutral-500">Describe the actual job. BidWire uses it to build the BOQ and target relevant suppliers.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs text-neutral-400">Project name</span><input name="name" required placeholder="Bakery fit-out" className="bidwire-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs text-neutral-400">Location</span><input name="location" required placeholder="Lagos, Nigeria" className="bidwire-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm" /></label></div><label className="block"><span className="mb-1.5 block text-xs text-neutral-400">Job description</span><textarea name="jobDescription" required rows={5} placeholder="Describe the work, equipment, quantities and constraints…" className="bidwire-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm" /></label><div className="grid gap-4 sm:grid-cols-[1fr_2fr]"><label className="block"><span className="mb-1.5 block text-xs text-neutral-400">Currency</span><input name="currency" required defaultValue="USD" className="bidwire-field w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs text-neutral-400">Photos or drawings <span className="text-neutral-700">optional</span></span><input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-neutral-200" /></label></div><div className="flex justify-end"><button type="submit" disabled={submitting} className="bidwire-button bidwire-button-primary">{submitting ? 'Creating…' : 'Create project'}</button></div></form>}

      {projects === undefined ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-white/10 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="mt-3 h-4 w-1/2" /><Skeleton className="mt-7 h-7 w-20" /></div>)}</div> : projects.length === 0 ? <EmptyState icon="⌂" title="No projects yet" description="Start with a real job or use the sample project to see the full quote-to-award workflow." action={<button onClick={() => void handleSample()} className="bidwire-button bidwire-button-primary">Launch sample job</button>} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p: any) => <Link key={p._id} to={`/p/${p._id}`} className="group rounded-2xl border border-white/10 bg-white/[.02] p-5 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.035]"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold tracking-tight group-hover:text-white">{p.name}</p><p className="mt-1 text-sm text-neutral-500">{p.location}</p></div><StatusPill tone={p.status === 'awarded' ? 'green' : p.status === 'cancelled' ? 'red' : 'amber'}>{p.status}</StatusPill></div><div className="mt-8 flex items-center justify-between text-xs text-neutral-600"><span>Open workspace</span><span className="text-neutral-400 transition group-hover:translate-x-1">→</span></div></Link>)}</div>}
    </main>
  </div>
}
