import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { AuthBrandHeader } from '../AuthBrandHeader'
import { LoginForm } from './LoginForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const MENSAJES: Record<string, string> = {
  token_faltante: 'El link no tiene token.',
  token_invalido: 'El link venció o no es válido. Pedí uno nuevo.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verificado?: string; club?: string }>
}) {
  const params = await searchParams

  const club = params.club
    ? (await db.select().from(clubs).where(and(eq(clubs.slug, params.club), isNull(clubs.deletedAt))).limit(1))[0]
    : undefined

  // El botón/foco toman el color de marca del club (mismo mecanismo que
  // brandTokens() en src/lib/theme.ts, pero acá solo el submit necesita
  // el override — el resto de la Card se queda con los tokens neutros de
  // siempre para no arriesgar contraste en una pantalla de auth).
  const brandStyle: CSSProperties | undefined = club?.branding?.primary
    ? ({ '--primary': club.branding.primary, '--ring': club.branding.primary } as CSSProperties)
    : undefined

  return (
    <div style={brandStyle}>
      <AuthBrandHeader clubSlug={params.club} />
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
    </div>
  )
}
