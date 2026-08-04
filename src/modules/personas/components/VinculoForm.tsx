'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { buscarPersonasParaVinculo, crearVinculo, unificarCuentaCorriente } from '../actions'

type Resultado = { id: string; nombre: string; docNumber: string | null }

export function VinculoForm({ clubSlug, personId }: { clubSlug: string; personId: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [elegido, setElegido] = useState<Resultado | null>(null)
  const [kind, setKind] = useState<'tutor_de' | 'conyuge_de' | 'hermano_de'>('tutor_de')
  const [error, setError] = useState<string | null>(null)
  const [ofertaUnificar, setOfertaUnificar] = useState<{ cuentaTutorId: string | null } | null>(null)

  async function buscar(valor: string) {
    setQ(valor)
    setElegido(null)
    if (valor.trim().length < 2) {
      setResultados([])
      return
    }
    const r = await buscarPersonasParaVinculo(clubSlug, valor)
    if (r.ok) setResultados(r.data.filter((p) => p.id !== personId))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!elegido) {
      setError('Elegí una persona de la lista')
      return
    }
    const result = await crearVinculo(clubSlug, { personId, relatedPersonId: elegido.id, kind })
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.data.ofrecerUnificarCuenta) {
      setOfertaUnificar({ cuentaTutorId: result.data.cuentaTutorId })
      return
    }
    router.refresh()
  }

  async function unificar() {
    if (!ofertaUnificar?.cuentaTutorId) return
    await unificarCuentaCorriente(clubSlug, personId, ofertaUnificar.cuentaTutorId)
    setOfertaUnificar(null)
    router.refresh()
  }

  if (ofertaUnificar) {
    return (
      <div style={{ border: '1px solid #ccc', padding: '0.75rem', marginTop: '0.5rem' }}>
        {ofertaUnificar.cuentaTutorId ? (
          <>
            <p>El tutor ya tiene una cuenta corriente familiar. ¿Unificar esta persona a esa cuenta?</p>
            <button type="button" onClick={unificar}>
              Sí, unificar
            </button>{' '}
            <button type="button" onClick={() => { setOfertaUnificar(null); router.refresh() }}>
              No por ahora
            </button>
          </>
        ) : (
          <>
            <p>El tutor todavía no tiene cuenta corriente propia (se crea en el módulo de cuotas).</p>
            <button type="button" onClick={() => { setOfertaUnificar(null); router.refresh() }}>
              Entendido
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem', maxWidth: 420 }}>
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        <option value="tutor_de">Es tutor de...</option>
        <option value="conyuge_de">Es cónyuge de...</option>
        <option value="hermano_de">Es hermano/a de...</option>
      </select>
      <input
        type="search"
        placeholder="Buscar persona por apellido o DNI"
        value={q}
        onChange={(e) => buscar(e.target.value)}
      />
      {resultados.length > 0 && !elegido && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #ddd' }}>
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setElegido(r)
                  setResultados([])
                  setQ(r.nombre)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '0.35rem' }}
              >
                {r.nombre} {r.docNumber ? `· ${r.docNumber}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Crear vínculo</button>
    </form>
  )
}
