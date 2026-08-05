import { redirect } from 'next/navigation'
import { rolesEnClub, STAFF_ROLES } from '@/lib/permissions'

export default async function ClubIndex({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const ctx = await rolesEnClub(slug)
  if (!ctx) {
    redirect('/')
  }
  const esStaff = ctx.roles.some((r) => STAFF_ROLES.has(r))
  redirect(`/${slug}/${esStaff ? 'dashboard' : 'portal'}`)
}
