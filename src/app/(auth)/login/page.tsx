import Link from 'next/link'
import { LoginForm } from './LoginForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Ingresar</CardTitle>
          <CardDescription>Entrá con tu email y contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.verificado && (
            <p className="mb-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
              Email verificado. Ya podés ingresar.
            </p>
          )}
          {params.error && (
            <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {MENSAJES[params.error] ?? 'Ocurrió un error.'}
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>¿No tenés cuenta?</span>
        <Link href="/registro" className="font-medium text-foreground hover:underline">
          Registrate
        </Link>
      </div>
      <div className="mt-1 text-center text-sm">
        <Link href="/recuperar" className="font-medium text-muted-foreground hover:text-foreground hover:underline">
          Olvidé mi contraseña
        </Link>
      </div>
    </>
  )
}
