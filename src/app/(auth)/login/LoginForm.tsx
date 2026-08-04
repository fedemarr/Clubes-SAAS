'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Mail, ShieldAlert } from 'lucide-react'
import { enviarMagicLink } from './actions'
import { reenviarVerificacion } from '../registro/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

type FormValues = z.infer<typeof schema>

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [verificationResent, setVerificationResent] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    })

    if (result?.error) {
      setServerError('Email, contraseña o verificación de email inválidos')
      return
    }

    window.location.href = '/'
  }

  async function onMagicLink() {
    setServerError(null)
    const email = getValues('email')
    const parsed = z.string().email().safeParse(email)
    if (!parsed.success) {
      setServerError('Ingresá tu email para mandarte el link')
      return
    }
    await enviarMagicLink(parsed.data)
    setMagicSent(true)
  }

  async function onReenviarVerificacion() {
    setServerError(null)
    const email = getValues('email')
    const parsed = z.string().email().safeParse(email)
    if (!parsed.success) {
      setServerError('Ingresá tu email para reenviar la verificación')
      return
    }
    await reenviarVerificacion(parsed.data)
    setVerificationResent(true)
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
        <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
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
      {magicSent && (
        <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Si el email existe, te mandamos un link de acceso.
        </p>
      )}
      {verificationResent && (
        <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Si el email existe y no estaba verificado, te reenviamos el link.
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <Button type="button" variant="outline" onClick={onMagicLink} className="w-full">
        <Mail data-icon="inline-start" />
        Mandarme un link de acceso
      </Button>
      <button
        type="button"
        onClick={onReenviarVerificacion}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Reenviar verificación de email
      </button>
    </form>
  )
}
