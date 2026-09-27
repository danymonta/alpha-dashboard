import 'server-only'

import { headers } from 'next/headers'

import { origineAmmessa } from '@/lib/auth/origine'
import { publicEnv } from '@/lib/env'

/** The origin of the current request (server actions and pages), checked. */
export async function origineCorrente(): Promise<string> {
  const h = await headers()
  const origin = h.get('origin')
  if (origin) return origineAmmessa(origin, publicEnv.appUrl)
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return origineAmmessa(host ? `${proto}://${host}` : null, publicEnv.appUrl)
}
