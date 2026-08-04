const ESTADOS = ['activo', 'pendiente_aprobacion', 'prospecto', 'inactivo', 'baja']

/**
 * Formulario GET plano: navega a la misma página con otros searchParams.
 * No necesita 'use client' — es la forma más simple de mantener la
 * búsqueda en la URL (compartible, sin JS) en un módulo mobile-first.
 */
export function BuscadorPersonas({
  categorias,
  valores,
}: {
  categorias: { id: string; label: string; sport: string }[]
  valores: { q?: string; categoria?: string; estado?: string }
}) {
  return (
    <form
      method="GET"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}
    >
      <input
        type="search"
        name="q"
        placeholder="Apellido, DNI o N° de socio"
        defaultValue={valores.q}
        style={{ flex: '1 1 200px', padding: '0.5rem' }}
      />
      <select name="categoria" defaultValue={valores.categoria ?? ''} style={{ padding: '0.5rem' }}>
        <option value="">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.sport} · {c.label}
          </option>
        ))}
      </select>
      <select name="estado" defaultValue={valores.estado ?? ''} style={{ padding: '0.5rem' }}>
        <option value="">Todos los estados</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      <button type="submit">Buscar</button>
    </form>
  )
}
