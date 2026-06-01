'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { COOKIE_NAME, deriveToken } from '@/lib/auth'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length)
  let mismatch = 0
  for (let i = 0; i < maxLen; i++) {
    mismatch |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0)
  }
  return mismatch === 0
}

export async function loginAction(
  data: { username: string; password: string }
): Promise<{ error: string } | void> {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) return { error: 'Invalid input' }

  const { username, password } = parsed.data
  const expectedUser = process.env.AUTH_USERNAME ?? ''
  const expectedPass = process.env.AUTH_PASSWORD ?? ''
  const secret = process.env.AUTH_SECRET ?? ''

  const userMatch = constantTimeEqual(username, expectedUser)
  const passMatch = constantTimeEqual(password, expectedPass)

  if (!userMatch || !passMatch) return { error: 'Invalid credentials' }

  const token = await deriveToken(secret)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect('/')
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  redirect('/login')
}
