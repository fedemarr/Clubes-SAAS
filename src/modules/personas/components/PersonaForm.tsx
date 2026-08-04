'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { actualizarPersona, crearPersona } from '../actions'
import { personaSchema } from '../schemas'

const formSchema = personaSchema.omit({ status: true }).extend({
  status: z.string().optional(),
})

type FormValues = z.input<typeof formSchema>

type PersonaExistente = {
  id: string
  firstName: string
  lastName: string
  docType: string
  docNumber: string | null
  bornOn: string | null
  email: string | null
  phone: string | null
  photoUrl: string | null
  status: string
}

export function PersonaForm({ clubSlug, persona }: { clubSlug: string; persona?: PersonaExistente }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [existingLink, setExistingLink] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: persona
      ? {
          firstName: persona.firstName,
          lastName: persona.lastName,
          docType: persona.docType,
          docNumber: persona.docNumber ?? undefined,
          bornOn: persona.bornOn ?? undefined,
          email: persona.email ?? undefined,
          phone: persona.phone ?? undefined,
          photoUrl: persona.photoUrl ?? undefined,
          status: persona.status,
        }
      : { docType: 'DNI', status: 'activo' },
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setExistingLink(null)

    if (persona) {
      const result = await actualizarPersona(clubSlug, persona.id, values)
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      router.push(`/${clubSlug}/personas/${persona.id}`)
      return
    }

    const result = await crearPersona(clubSlug, values)
    if (!result.ok) {
      setServerError(result.error)
      if ('existingPersonId' in result) setExistingLink(result.existingPersonId)
      return
    }
    router.push(`/${clubSlug}/personas/${result.data.id}`)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <label>
          Nombre
          <input {...register('firstName')} />
          {errors.firstName && <p role="alert">{errors.firstName.message}</p>}
        </label>
        <label>
          Apellido
          <input {...register('lastName')} />
          {errors.lastName && <p role="alert">{errors.lastName.message}</p>}
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
        <label>
          Tipo doc.
          <input {...register('docType')} />
        </label>
        <label>
          Documento
          <input {...register('docNumber')} />
          {errors.docNumber && <p role="alert">{errors.docNumber.message}</p>}
        </label>
      </div>
      <label>
        Fecha de nacimiento
        <input type="date" {...register('bornOn')} />
      </label>
      <label>
        Email
        <input type="email" {...register('email')} />
        {errors.email && <p role="alert">{errors.email.message}</p>}
      </label>
      <label>
        Teléfono
        <input {...register('phone')} />
      </label>
      <label>
        Foto (URL)
        <input {...register('photoUrl')} />
      </label>
      <label>
        Estado
        <select {...register('status')}>
          <option value="activo">Activo</option>
          <option value="pendiente_aprobacion">Pendiente de aprobación</option>
          <option value="prospecto">Prospecto</option>
          <option value="inactivo">Inactivo</option>
          <option value="baja">Baja</option>
        </select>
      </label>

      {serverError && (
        <p role="alert">
          {serverError}
          {existingLink && (
            <>
              {' — '}
              <a href={`/${clubSlug}/personas/${existingLink}`}>ver ficha existente</a>
            </>
          )}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        {persona ? 'Guardar cambios' : 'Crear persona'}
      </button>
    </form>
  )
}
