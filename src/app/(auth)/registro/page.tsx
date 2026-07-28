import Link from 'next/link'
import { RegistroForm } from './RegistroForm'

export default function RegistroPage() {
  return (
    <main style={{ padding: '3rem', fontFamily: 'sans-serif' }}>
      <h1>Crear cuenta</h1>
      <p>
        Esto solo crea tu login. Para sumarte a un club, usá el link de inscripción que te
        pase el club (eso llega en un módulo posterior).
      </p>
      <RegistroForm />
      <p>
        ¿Ya tenés cuenta? <Link href="/login">Ingresar</Link>
      </p>
    </main>
  )
}
