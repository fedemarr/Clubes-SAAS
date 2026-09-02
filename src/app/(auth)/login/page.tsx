import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Shield } from 'lucide-react'
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

  // portalTheme no está en el tipo de schema.ts (jsonb sin validar en
  // runtime): cast local, mismo criterio que en /portal/carnet y en el
  // layout del portal.
  const branding = club?.branding as { primary?: string; secondary?: string; tagline?: string; portalTheme?: string } | null
  const primary = branding?.primary
  const secondary = branding?.secondary
  const oscuro = branding?.portalTheme === 'dark'

  const mensajes = (
    <>
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
    </>
  )

  // Panel de marca oscuro (club.branding.portalTheme === 'dark'): todo lo
  // demás (registro, recuperar, login sin club, cualquier otro club) sigue
  // exactamente igual que antes, sin regresión visual.
  if (club && oscuro) {
    return (
      <div
        className="relative overflow-hidden rounded-3xl px-7 pt-10 pb-8 shadow-2xl"
        style={{ background: `radial-gradient(ellipse 90% 46% at 50% -6%, color-mix(in oklab, ${primary ?? '#1f2937'} 55%, transparent), transparent 60%), #0A0C10` }}
      >
        {secondary && (
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full opacity-15 blur-2xl"
            style={{ background: secondary }}
          />
        )}

        <div className="relative flex flex-col items-center">
          {club.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logoUrl} alt="" width={92} height={104} className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]" />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: primary }}>
              <Shield className="size-7" />
            </div>
          )}
          <p className="mt-4 text-xl font-extrabold tracking-wide text-white uppercase">{club.name}</p>
          {branding?.tagline && (
            <p className="mt-0.5 text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: secondary ?? '#fff' }}>
              Portal del socio
            </p>
          )}
        </div>

        <Card
          className="relative mt-8 shadow-xl"
          style={secondary ? ({ '--primary': secondary, '--primary-foreground': '#111827', '--ring': secondary } as React.CSSProperties) : undefined}
        >
          <CardHeader>
            <CardTitle>Ingresar</CardTitle>
            <CardDescription>Entrá con tu email y contraseña.</CardDescription>
          </CardHeader>
          <CardContent>
            {mensajes}
            <LoginForm />
          </CardContent>
        </Card>

        <div className="relative mt-5 flex flex-col items-center gap-1.5 text-sm">
          <p className="text-white/55">
            ¿No tenés cuenta?{' '}
            <Link href="/registro" className="font-semibold" style={{ color: secondary ?? '#fff' }}>
              Registrate
            </Link>
          </p>
          <Link href="/recuperar" className="text-xs text-white/40 hover:text-white/70">
            Olvidé mi contraseña
          </Link>
        </div>
      </div>
    )
  }

  const brandStyle = primary ? ({ '--primary': primary, '--ring': primary } as React.CSSProperties) : undefined

  return (
    <div style={brandStyle}>
      <AuthBrandHeader clubSlug={params.club} />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Ingresar</CardTitle>
          <CardDescription>Entrá con tu email y contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          {mensajes}
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
