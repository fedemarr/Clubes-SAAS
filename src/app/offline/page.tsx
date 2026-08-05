import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="size-6" />
      </div>
      <h1 className="text-base font-semibold tracking-tight">Estás sin conexión</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Las páginas que ya visitaste siguen disponibles. Cuando vuelvas a tener internet, todo se actualiza solo.
      </p>
    </main>
  )
}
