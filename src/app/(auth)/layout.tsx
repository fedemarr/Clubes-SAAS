import { Shield } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, var(--foreground) 8%, transparent), transparent)',
        }}
      />
      <div className="relative flex w-full max-w-sm flex-col">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Shield className="size-6" />
          </div>
          <p className="text-sm font-semibold tracking-tight">Club SaaS</p>
        </div>
        {children}
      </div>
    </main>
  )
}
