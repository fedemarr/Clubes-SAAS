import { Resend } from 'resend'

type SendMailInput = {
  to: string
  subject: string
  html: string
}

/**
 * Sin RESEND_API_KEY (por ejemplo en desarrollo local antes de tener
 * cuenta de Resend), loguea el mail a consola en vez de fallar, para
 * poder probar el flujo de auth de punta a punta igual.
 */
export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? 'no-reply@localhost'

  if (!apiKey) {
    console.log(`[mail:dev] a=${to} asunto="${subject}"\n${html}`)
    return
  }

  const resend = new Resend(apiKey)
  await resend.emails.send({ from, to, subject, html })
}
