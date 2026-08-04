const ESTADOS: Record<string, { className: string; label: string }> = {
  activo: { className: 'bg-green-500/10 text-green-700', label: 'Activo' },
  pendiente_aprobacion: { className: 'bg-amber-500/10 text-amber-700', label: 'Pendiente' },
  prospecto: { className: 'bg-indigo-500/10 text-indigo-700', label: 'Prospecto' },
  inactivo: { className: 'bg-muted text-muted-foreground', label: 'Inactivo' },
  baja: { className: 'bg-red-500/10 text-red-700', label: 'Baja' },
}

export function EstadoBadge({ status }: { status: string }) {
  const c = ESTADOS[status] ?? { className: 'bg-muted text-muted-foreground', label: status }
  return (
    <span className={`inline-flex h-5 w-fit items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  )
}
