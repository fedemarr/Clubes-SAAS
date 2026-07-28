'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { enviarMagicLink } from './actions'
import { reenviarVerificacion } from '../registro/actions'

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
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '0.75rem', maxWidth: 360 }}>
      <label>
        Email
        <input type="email" {...register('email')} />
        {errors.email && <p role="alert">{errors.email.message}</p>}
      </label>
      <label>
        Contraseña
        <input type="password" {...register('password')} />
        {errors.password && <p role="alert">{errors.password.message}</p>}
      </label>
      {serverError && <p role="alert">{serverError}</p>}
      {magicSent && <p>Si el email existe, te mandamos un link de acceso.</p>}
      {verificationResent && <p>Si el email existe y no estaba verificado, te reenviamos el link.</p>}
      <button type="submit" disabled={isSubmitting}>
        Ingresar
      </button>
      <button type="button" onClick={onMagicLink}>
        Mandarme un link de acceso
      </button>
      <button type="button" onClick={onReenviarVerificacion}>
        Reenviar verificación de email
      </button>
    </form>
  )
}
