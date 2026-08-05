import { Badge } from '@/components/ui/badge'

const ESTILO: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendiente: 'secondary',
  vigente: 'default',
  vencido: 'destructive',
  rechazado: 'outline',
}

const ETIQUETA: Record<string, string> = {
  pendiente: 'Pendiente',
  vigente: 'Vigente',
  vencido: 'Vencido',
  rechazado: 'Rechazado',
}

export function EstadoDocumentoBadge({ status }: { status: string }) {
  return <Badge variant={ESTILO[status] ?? 'outline'}>{ETIQUETA[status] ?? status}</Badge>
}
