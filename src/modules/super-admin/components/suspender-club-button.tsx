'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RotateCcw, Power } from 'lucide-react'
import { setearSuspensionClub } from '../actions'
import { Button } from '@/components/ui/button'

export function SuspenderClubButton({ slug, suspendido }: { slug: string; suspendido: boolean }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function onClick() {
    setSubmitting(true)
    const result = await setearSuspensionClub(slug, !suspendido)
    setSubmitting(false)
    if (!result.ok) return
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant={suspendido ? 'outline' : 'destructive'}
      size="sm"
      onClick={onClick}
      disabled={submitting}
    >
      {suspendido ? <RotateCcw className="size-3.5" /> : <Power className="size-3.5" />}
      {suspendido ? 'Reactivar' : 'Suspender'}
    </Button>
  )
}