import Link from 'next/link'
import { LoginForm } from './LoginForm'

const MENSAJES: Record<string, string> = {
  token_faltante: 'El link no tiene token.',
  token_invalido: 'El link venció o no es válido. Pedí uno nuevo.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verificado?: string }>
}) {
  const params = await searchParams

  return (
    <main style={{ padding: '3rem', fontFamily: 'sans-serif' }}>
      <h1>Ingresar</h1>
      {params.verificado && <p>Email verificado. Ya podés ingresar.</p>}
      {params.error && <p role="alert">{MENSAJES[params.error] ?? 'Ocurrió un error.'}</p>}
      <LoginForm />
      <p>
        ¿No tenés cuenta? <Link href="/registro">Registrate</Link>
      </p>
      <p>
        <Link href="/recuperar">Olvidé mi contraseña</Link>
      </p>
    </main>
  )
}
