'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ShieldAlert } from 'lucide-react'
import { registrarUsuario } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Al menos 8 caracteres'),
})

type FormValues = z.infer<typeof schema>

export function RegistroForm({ clubSlug }: { clubSlug?: string }) {
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const result = await registrarUsuario({ ...values, clubSlug })
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700">
        Te mandamos un mail para confirmar tu cuenta. Revisá tu bandeja de entrada.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="vos@club.com" {...register('email')} />
        {errors.email && (
          <p role="alert" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        {errors.password && (
          <p role="alert" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverError && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ShieldAlert className="size-4 shrink-0" />
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Creando…' : 'Crear cuenta'}
      </Button>
    </form>
  )
}
