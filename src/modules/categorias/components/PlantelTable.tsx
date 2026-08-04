type Miembro = {
  membershipId: string
  personId: string
  nombre: string
  apellido: string
  position: string | null
  validFrom: string
}

export function PlantelTable({ clubSlug, plantel }: { clubSlug: string; plantel: Miembro[] }) {
  if (plantel.length === 0) {
    return <p>Todavía no hay nadie asignado a esta categoría.</p>
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
      {plantel.map((m) => (
        <li
          key={m.membershipId}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', border: '1px solid #eee' }}
        >
          <a href={`/${clubSlug}/personas/${m.personId}`}>
            {m.apellido}, {m.nombre}
          </a>
          <span>
            {m.position ?? '—'} · desde {m.validFrom}
          </span>
        </li>
      ))}
    </ul>
  )
}
