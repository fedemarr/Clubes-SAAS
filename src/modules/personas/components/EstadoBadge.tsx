const COLORES: Record<string, { bg: string; fg: string; label: string }> = {
  activo: { bg: '#DCFCE7', fg: '#166534', label: 'Activo' },
  pendiente_aprobacion: { bg: '#FEF9C3', fg: '#854D0E', label: 'Pendiente' },
  prospecto: { bg: '#E0E7FF', fg: '#3730A3', label: 'Prospecto' },
  inactivo: { bg: '#F3F4F6', fg: '#374151', label: 'Inactivo' },
  baja: { bg: '#FEE2E2', fg: '#991B1B', label: 'Baja' },
}

export function EstadoBadge({ status }: { status: string }) {
  const c = COLORES[status] ?? { bg: '#F3F4F6', fg: '#374151', label: status }
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        borderRadius: 999,
        padding: '0.15rem 0.6rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  )
}
