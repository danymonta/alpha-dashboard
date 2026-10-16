import type { NextRequest } from 'next/server'

/** The request comes from a page of this app (the browser sends Origin on a POST). */
export function stessaOrigine(request: NextRequest): boolean {
  const origine = request.headers.get('origin')
  if (!origine) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return Boolean(host) && new URL(origine).host === host
  } catch {
    return false
  }
}
