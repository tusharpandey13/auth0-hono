import { Context } from 'hono'
import { SessionData } from '@auth0/auth0-server-js'
import { SESSION_CACHE_KEY } from '@/lib/constants.js'
import { getClient } from '@/config/index.js'

/**
 * Get session from request-scoped cache, or load from server-js client and cache.
 *
 * Avoids duplicate cookie parse + AES decrypt operations within a single request.
 * If client.getSession throws, the error propagates and cache remains unset,
 * allowing retry on next request.
 *
 * @param c - Hono context
 * @returns SessionData or null if no active session
 * @throws Auth0Error if client initialization fails
 * @internal
 */
export async function getCachedSession(c: Context): Promise<SessionData | null> {
  // Check cache first
  // TypeScript cannot resolve const string keys against ContextVariableMap augmentation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cached = (c as any).get(SESSION_CACHE_KEY)
  if (cached !== undefined) {
    return cached as SessionData | null // Cache hit (including null for "no session" case)
  }

  // Cache miss — load from server-js client
  const { client } = getClient(c)
  const session = (await client.getSession(c)) ?? null

  // Store in cache (including null)
  // TypeScript cannot resolve const string keys against ContextVariableMap augmentation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(c as any).set(SESSION_CACHE_KEY, session)

  return session
}

/**
 * Clear session cache to force reload on next access.
 *
 * Called after session mutations (updateSession, refresh) or when session state changes.
 *
 * @param c - Hono context
 * @internal
 */
export function invalidateSessionCache(c: Context): void {
  c.set(SESSION_CACHE_KEY, undefined)
}
