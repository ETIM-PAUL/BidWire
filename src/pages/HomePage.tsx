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
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setSubmitting(true)
    try {
      const attachmentIds: Id<'_storage'>[] = []
      for (const file of files) {
        const uploadUrl = await generateUploadUrl()
        const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
        attachmentIds.push(storageId)
      }
      await createProject({ name: String(data.get('name')), jobDescription: String(data.get('jobDescription') ?? ''), location: String(data.get('location') ?? ''), currency: String(data.get('currency') ?? 'USD'), attachmentIds: attachmentIds.length ? attachmentIds : undefined })
      form.reset(); setFiles([]); setShowForm(false)
      toast('success', 'Project created', 'Your BOQ workflow is now running.')
    } catch (error) { toast('error', 'Could not create project', error instanceof Error ? error.message : 'Please try again.') }
    finally { setSubmitting(false) }
  }

  async function handleSample() {
    setSubmitting(true)
    try { await launchSample(); toast('success', 'Sample job launched', 'A bathroom renovation project is being prepared.') }
    catch (error) { toast('error', 'Sample job failed', error instanceof Error ? error.message : 'Please try again.') }
    finally { setSubmitting(false) }
  }

  const activeCount = projects?.filter((p: any) => !['awarded', 'cancelled'].includes(p.status)).length ?? 0
  const awardedCount = projects?.filter((p: any) => p.status === 'awarded').length ?? 0

  return <div className="bidwire-app-bg min-h-screen text-neutral-100">
    <header className="sticky top-3 z-30 px-3 sm:px-5"><div className="bidwire-shell bidwire-topbar flex h-[68px] items-center justify-between rounded-2xl px-4 sm:px-5">
      <Link to="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bw-accent)] text-sm font-black text-[#06100c] shadow-[0_0_28px_rgba(66,230,177,.18)]">B</span><span className="hidden text-sm font-bold tracking-[.16em] uppercase sm:block">BidWire</span></Link>
      <nav className="hidden items-center gap-1 rounded-xl border border-white/5 bg-black/15 p-1 md:flex"><Link to="/" className="rounded-lg bg-white/[.07] px-3 py-2 text-xs font-semibold text-white">Workspace</Link><Link to="/insights" className="rounded-lg px-3 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-white/[.05] hover:text-neutral-200">Insights</Link>{isDemoAdmin && <Link to="/admin/simulator" className="rounded-lg px-3 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-white/[.05] hover:text-neutral-200">Simulator</Link>}</nav>
      <SignOutButton />
    </div></header>

    <main className="bidwire-shell pb-14 pt-7 sm:pt-10">
      <section className="relative overflow-hidden rounded-[1.7rem] border border-white/[.08] bg-gradient-to-br from-[#10191a] via-[#0c1217] to-[#0b1015] p-6 shadow-[0_30px_100px_rgba(0,0,0,.2)] sm:p-9 lg:p-11">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-emerald-300/[.08] blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div><div className="bidwire-eyebrow">Procurement command center</div><h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-.045em] text-white sm:text-5xl lg:text-6xl">Turn a messy job brief into a procurement decision.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg">BidWire connects scope, suppliers, email replies, quote comparison, negotiation and award in one controlled workflow.</p><div className="mt-7 flex flex-wrap gap-2"><button onClick={() => setShowForm(true)} className="bidwire-button bidwire-button-primary">+ New project</button><button onClick={() => void handleSample()} disabled={submitting} className="bidwire-button bidwire-button-secondary">{submitting ? 'Preparing…' : 'Run sample workflow'}</button></div></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2"><div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-xs text-neutral-500">Total projects</p><p className="mt-2 text-2xl font-semibold">{projects?.length ?? '—'}</p></div><div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-xs text-neutral-500">Active workflows</p><p className="mt-2 text-2xl font-semibold text-[var(--bw-accent)]">{projects ? activeCount : '—'}</p></div><div className="col-span-2 rounded-2xl border border-white/[.08] bg-black/20 p-4 sm:col-span-1 lg:col-span-2"><p className="text-xs text-neutral-500">Completed awards</p><p className="mt-2 text-2xl font-semibold">{projects ? awardedCount : '—'}</p></div></div>
        </div>
      </section>

      {showForm && <form onSubmit={handleSubmit} className="bidwire-panel mt-5 grid gap-5 rounded-2xl p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="bidwire-eyebrow">New procurement</div><p className="mt-1 text-xl font-semibold">Start with the real job</p><p className="mt-1 text-sm text-neutral-500">Give BidWire enough context to build a useful BOQ and supplier search.</p></div><button type="button" onClick={() => setShowForm(false)} className="bidwire-button bidwire-button-ghost">Close</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Project name</span><input name="name" required placeholder="Bakery fit-out" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Location</span><input name="location" required placeholder="Lagos, Nigeria" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label></div><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Job description</span><textarea name="jobDescription" required rows={5} placeholder="Describe the work, quantities, specifications and constraints…" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label><div className="grid gap-4 sm:grid-cols-[1fr_2fr]"><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Currency</span><input name="currency" required defaultValue="USD" className="bidwire-field w-full rounded-xl px-3.5 py-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-medium text-neutral-400">Photos or drawings <span className="text-neutral-700">optional</span></span><input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))} className="w-full rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2.5 text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-neutral-200" /></label></div><div className="flex justify-end"><button type="submit" disabled={submitting} className="bidwire-button bidwire-button-primary">{submitting ? 'Creating…' : 'Create project'}</button></div></form>}

      <section className="mt-8"><div className="mb-4 flex items-end justify-between"><div><div className="bidwire-eyebrow">Your pipeline</div><h2 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h2></div><span className="text-xs text-neutral-600">{projects?.length ?? 0} workspace(s)</span></div>{projects === undefined ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((i) => <div key={i} className="bidwire-panel rounded-2xl p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="mt-3 h-4 w-1/2" /><Skeleton className="mt-8 h-8 w-24" /></div>)}</div> : projects.length === 0 ? <EmptyState icon="⌂" title="No projects yet" description="Start with a real job or run the sample workflow to explore the full quote-to-award path." action={<button onClick={() => setShowForm(true)} className="bidwire-button bidwire-button-primary">Create your first project</button>} /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p: any) => <Link key={p._id} to={`/p/${p._id}`} className="bidwire-panel bidwire-panel-hover group rounded-2xl p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.06] text-xs font-bold text-neutral-300">{String(p.name).slice(0,1).toUpperCase()}</span><p className="truncate font-semibold tracking-tight text-white">{p.name}</p></div><p className="mt-3 text-sm text-neutral-500">{p.location}</p></div><StatusPill tone={p.status === 'awarded' ? 'green' : p.status === 'cancelled' ? 'red' : 'amber'}>{p.status}</StatusPill></div><div className="mt-7 flex items-center justify-between border-t border-white/[.06] pt-4 text-xs"><span className="text-neutral-600">Open workspace</span><span className="text-neutral-400 transition group-hover:translate-x-1 group-hover:text-white">→</span></div></Link>)}</div>}</section>
    </main>
  </div>
}
