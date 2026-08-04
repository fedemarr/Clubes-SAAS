import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function RecuperarPage() {
  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            Todavía no está implementado. Si lo necesitás ahora, avisá y lo priorizamos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} variant="outline" className="w-full">
            Volver a ingresar
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
