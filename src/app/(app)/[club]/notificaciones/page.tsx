import { Bell } from 'lucide-react'
import { checkPermission } from '@/lib/permissions'
import { listarNotificaciones } from '@/modules/notificaciones/queries'
import { NotificacionesPanel } from '@/modules/notificaciones/components/NotificacionesPanel'
import { PushSubscribeCard } from '@/modules/notificaciones/components/PushSubscribeCard'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export default async function NotificacionesPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('notificaciones.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés acceso a las notificaciones.</main>
  }

  const items = await listarNotificaciones(ctx.clubId, ctx.userId)

  return (
    <main>
      <PageHeader
        title="Notificaciones"
        description="Tus avisos del club: cobranzas, pagos y convocatorias."
        actions={
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bell className="size-4" />
            {items.filter((n) => !n.readAt).length} sin leer
          </span>
        }
      />
      <NotificacionesPanel clubSlug={slug} iniciales={items} />
      <div className="mt-6">
        <PushSubscribeCard clubSlug={slug} />
      </div>
    </main>
  )
}
