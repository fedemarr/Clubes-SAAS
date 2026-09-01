import Link from 'next/link'
import { RegistroForm } from './RegistroForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthBrandHeader } from '../AuthBrandHeader'

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>
}) {
  const { club } = await searchParams

  return (
    <>
      <AuthBrandHeader clubSlug={club} />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>
            Esto solo crea tu login. Para sumarte a un club, usá el link de inscripción que te pase
            el club.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistroForm clubSlug={club} />
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground">
        <span>¿Ya tenés cuenta?</span>
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Ingresar
        </Link>
      </div>
    </>
  )
}
