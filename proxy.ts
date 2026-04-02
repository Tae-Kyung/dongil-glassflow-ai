import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseProxyClient } from '@/lib/supabase-proxy'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createSupabaseProxyClient(request, response)

  // getUser()로 세션 갱신 및 인증 확인 (getSession() 대신 사용)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/auth')

  if (!user && !isAuthRoute) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
