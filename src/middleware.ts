import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/login') return NextResponse.next()

  const secret = process.env.AUTH_SECRET
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value

  if (!secret || !cookieValue || !(await verifyToken(secret, cookieValue))) {
    const url = new URL('/login', request.url)
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
