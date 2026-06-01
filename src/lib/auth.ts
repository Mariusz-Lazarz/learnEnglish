export const COOKIE_NAME = 'auth_session'

const MESSAGE = 'authenticated_session'

export async function deriveToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(MESSAGE))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyToken(secret: string, candidate: string): Promise<boolean> {
  const expected = await deriveToken(secret)
  const maxLen = Math.max(expected.length, candidate.length)
  let mismatch = 0
  for (let i = 0; i < maxLen; i++) {
    mismatch |= (expected.charCodeAt(i) ?? 0) ^ (candidate.charCodeAt(i) ?? 0)
  }
  return mismatch === 0
}
