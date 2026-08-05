import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Almacenamiento de documentos (M7) en Cloudflare R2 (API S3). Los archivos
 * nunca pasan por el server de Next: el cliente sube con una URL firmada
 * (PUT) y el staff descarga con otra (GET). Sin credenciales R2 el flujo
 * funciona igual para probar el resto (estados, revisión, alertas): los
 * archivos no existen pero `[r2:dev]` loguea, igual que sendMail/enviarPush.
 */

const ACC_ID = process.env.R2_ACCOUNT_ID
const KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET

export function r2Configurado(): boolean {
  return Boolean(ACC_ID && KEY_ID && SECRET && BUCKET)
}

export function r2Bucket(): string {
  return BUCKET ?? ''
}

function client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACC_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: KEY_ID!, secretAccessKey: SECRET! },
  })
}

export function generarFileKey(clubId: string, ext: string): string {
  const limpio = ext.replace(/[^a-z0-9.]/gi, '').toLowerCase()
  const sufijo = limpio.startsWith('.') ? limpio : `.${limpio || 'bin'}`
  return `documentos/${clubId}/${crypto.randomUUID()}${sufijo}`
}

/** URL firmada de subida (PUT). Sin R2 configurado devuelve null (dev). */
export async function firmarUrlSubida(
  key: string,
  contentType: string,
): Promise<string | null> {
  if (!r2Configurado()) {
    console.log(`[r2:dev] subida (no enviada) key=${key} type=${contentType}`)
    return null
  }
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 900 },
  )
}

/** URL firmada de descarga (GET), 5 minutos. Sin R2 devuelve null (dev). */
export async function firmarUrlDescarga(key: string): Promise<string | null> {
  if (!r2Configurado()) {
    console.log(`[r2:dev] descarga (no disponible) key=${key}`)
    return null
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 300 },
  )
}

/** Borra el objeto. Tolerante: sin R2 o ante error solo loguea (best-effort). */
export async function borrarObjeto(key: string): Promise<void> {
  if (!r2Configurado()) {
    console.log(`[r2:dev] borrado (no enviado) key=${key}`)
    return
  }
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (err) {
    console.error('[r2] falló el borrado del objeto', key, err)
  }
}
