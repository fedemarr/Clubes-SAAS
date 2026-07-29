'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { registrarUsuario } from './actions'

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
    return <p>Te mandamos un mail para confirmar tu cuenta. Revisá tu bandeja de entrada.</p>
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
      <button type="submit" disabled={isSubmitting}>
        Crear cuenta
      </button>
    </form>
  )
}
