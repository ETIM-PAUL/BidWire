import type { Doc } from '../../convex/_generated/dataModel'

type BriefProps = { project: Doc<'projects'>; matrix: any; award: any; awardLines: any[] | undefined; onClose: () => void }

function clean(value: unknown) { return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '?') }
function wrap(text: string, width = 92) {
  const words = clean(text).split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!word) continue
    if ((current + ' ' + word).trim().length > width && current) { lines.push(current); current = word }
    else current = (current + ' ' + word).trim()
  }
  if (current) lines.push(current)
  return lines
}

function buildPdf(lines: string[]) {
  const perPage = 46
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage))
  if (!pages.length) pages.push(['BIDWIRE PROCUREMENT BRIEF'])

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const pageObjectIds: number[] = []
  for (const pageLines of pages) {
    const pageObjectId = objects.length + 1
    const contentObjectId = pageObjectId + 1
    pageObjectIds.push(pageObjectId)
    const commands = ['BT', '/F1 10 Tf', '40 760 Td']
    pageLines.forEach((line, index) => {
      if (index === 0) commands.push('/F1 16 Tf')
      else commands.push('/F1 10 Tf')
      const escaped = clean(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      commands.push(`(${escaped}) Tj`)
      commands.push('0 -15 Td')
    })
    commands.push('ET')
    const stream = commands.join('\n')
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /ProcSet [/PDF /Text] /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefOffset = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' })
}

export function downloadProcurementBrief({ project, matrix, award, awardLines }: Omit<BriefProps, 'onClose'>) {
  const lines: string[] = []
  lines.push('BIDWIRE PROCUREMENT BRIEF')
  lines.push(`${project.name} | ${project.location} | ${project.currency}`)
  lines.push(`Status: ${project.status}`)
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  lines.push('')
  if (award) {
    lines.push('AWARD SUMMARY')
    lines.push(`Total awarded spend: ${award.totalSpend.toLocaleString()} ${project.currency}`)
    lines.push(`Savings vs highest complete quote: ${Math.max(0, award.highestQuote - award.totalSpend).toLocaleString()} ${project.currency}`)
    lines.push(`Savings vs published prices: ${Math.max(0, award.publishedListTotal - award.totalSpend).toLocaleString()} ${project.currency}`)
    lines.push(`Award mode: ${award.mode}`)
    lines.push(`Delivery: ${award.deliveryAddress} by ${award.deliveryDate}`)
    lines.push('')
    lines.push('AWARDED ITEMS')
    for (const row of awardLines ?? []) lines.push(`${row.supplierName} | ${row.name} | ${row.quantity} ${row.unit} | ${row.unitPrice.toLocaleString()} / ${row.unit} | ${row.total.toLocaleString()} ${project.currency}`)
    lines.push('')
    const supplierTotals = new Map<string, number>()
    for (const row of awardLines ?? []) supplierTotals.set(row.supplierName, (supplierTotals.get(row.supplierName) ?? 0) + row.total)
    lines.push('SUPPLIER TOTALS')
    for (const [name, total] of supplierTotals) lines.push(`${name}: ${total.toLocaleString()} ${project.currency}`)
  }
  lines.push('')
  lines.push('SUPPLIER COMPARISON')
  for (const column of matrix.columns ?? []) lines.push(`${column.supplierName}: ${column.basketTotal.toLocaleString()} ${project.currency} | ${column.coveragePercent}% coverage | quote v${column.quoteVersion}`)
  lines.push('')
  lines.push('ITEM BREAKDOWN')
  for (const row of matrix.rows ?? []) {
    const best = row.cells?.find((cell: any) => cell.supplierId === row.bestSupplierId)
    const bestSupplier = matrix.columns?.find((column: any) => column.supplierId === row.bestSupplierId)?.supplierName ?? 'No quote'
    const lineTotal = best ? best.unitPrice * row.quantity : 0
    const quoted = best ? `${best.unitPrice.toLocaleString()} / ${row.unit} | ${lineTotal.toLocaleString()} ${project.currency}` : 'Not quoted'
    lines.push(`${row.name} | ${row.quantity} ${row.unit} | ${bestSupplier} | ${quoted}`)
  }
  const blob = buildPdf(lines.flatMap(line => line ? wrap(line) : ['']))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bidwire'}-procurement-brief.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ProcurementBriefModal({ project, matrix, award, awardLines, onClose }: BriefProps) {
  const supplierTotals = new Map<string, number>()
  for (const row of awardLines ?? []) supplierTotals.set(row.supplierName, (supplierTotals.get(row.supplierName) ?? 0) + row.total)
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e0c] p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="procurement-brief-title" onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.16em] text-amber-400">Procurement brief</p><h2 id="procurement-brief-title" className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h2><p className="mt-1 text-sm text-neutral-500">{project.location} · {project.currency} · {project.status}</p></div><button className="text-neutral-500 hover:text-white" onClick={onClose} aria-label="Close brief">×</button></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-neutral-600">Items</p><p className="mt-1 text-xl font-semibold">{matrix.rows.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-neutral-600">Suppliers</p><p className="mt-1 text-xl font-semibold">{matrix.columns.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-neutral-600">Best full basket</p><p className="mt-1 text-xl font-semibold">{matrix.bestFullCoverageBasketTotal?.toLocaleString() ?? '—'} <span className="text-xs font-normal text-neutral-600">{project.currency}</span></p></div><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.04] p-4"><p className="text-xs text-neutral-600">Awarded total</p><p className="mt-1 text-xl font-semibold text-emerald-300">{award ? `${award.totalSpend.toLocaleString()} ${project.currency}` : 'Not awarded'}</p></div></div>{award && <section className="mt-6"><h3 className="text-sm font-semibold">Award breakdown</h3><div className="mt-2 overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-sm"><thead><tr className="border-b border-white/10 text-left text-xs text-neutral-600"><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{(awardLines ?? []).map((row: any) => <tr key={`${row.supplierId}-${row.lineItemId}`} className="border-b border-white/[.05] last:border-0"><td className="px-4 py-3 text-neutral-200">{row.supplierName}</td><td className="px-4 py-3 text-neutral-300">{row.name}</td><td className="px-4 py-3 text-right text-neutral-500">{row.quantity} {row.unit}</td><td className="px-4 py-3 text-right text-neutral-400">{row.unitPrice.toLocaleString()}</td><td className="px-4 py-3 text-right font-medium text-neutral-200">{row.total.toLocaleString()} {project.currency}</td></tr>)}</tbody></table></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{[...supplierTotals].map(([name, total]) => <div key={name} className="rounded-lg border border-white/10 px-3 py-2 text-sm"><span className="text-neutral-500">{name}</span><span className="float-right font-medium">{total.toLocaleString()} {project.currency}</span></div>)}</div></section>}<section className="mt-6"><h3 className="text-sm font-semibold">Supplier comparison</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{matrix.columns.map((column: any) => <div key={column.supplierId} className="rounded-xl border border-white/10 p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium text-neutral-200">{column.supplierName}</span><span className="text-sm text-neutral-300">{column.basketTotal.toLocaleString()} {project.currency}</span></div><p className="mt-1 text-xs text-neutral-600">{column.coveragePercent}% coverage · quote v{column.quoteVersion}{column.deliveryCost ? ` · delivery ${column.deliveryCost.toLocaleString()}` : ''}</p></div>)}</div></section><section className="mt-6"><h3 className="text-sm font-semibold">Item breakdown</h3><div className="mt-2 overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-sm"><thead><tr className="border-b border-white/10 text-left text-xs text-neutral-600"><th className="px-4 py-3">Item</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Lowest quoted supplier</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Line total</th></tr></thead><tbody>{matrix.rows.map((row: any) => { const best = row.cells?.find((cell: any) => cell.supplierId === row.bestSupplierId); const supplier = matrix.columns?.find((column: any) => column.supplierId === row.bestSupplierId); const lineTotal = best ? best.unitPrice * row.quantity : 0; return <tr key={row.lineItemId} className="border-b border-white/[.05] last:border-0"><td className="px-4 py-3 text-neutral-200">{row.name}</td><td className="px-4 py-3 text-neutral-500">{row.quantity} {row.unit}</td><td className="px-4 py-3 text-neutral-300">{supplier?.supplierName ?? 'No quote'}</td><td className="px-4 py-3 text-right text-neutral-400">{best ? best.unitPrice.toLocaleString() : '—'}</td><td className="px-4 py-3 text-right text-neutral-300">{best ? `${lineTotal.toLocaleString()} ${project.currency}` : '—'}</td></tr> })}</tbody></table></div></section><div className="mt-7 flex justify-end gap-2 border-t border-white/[.06] pt-4"><button className="bidwire-button bidwire-button-secondary" onClick={onClose}>Close</button><button className="bidwire-button bidwire-button-primary" onClick={() => downloadProcurementBrief({ project, matrix, award, awardLines })}>Download brief (PDF)</button></div></div></div>
}
