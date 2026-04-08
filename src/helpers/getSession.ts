import { Context } from 'hono'
import { SessionData } from '@auth0/auth0-server-js'
import { getCachedSession } from './sessionCache.js'

/**
 * Get the current session or null if not authenticated.
 *
 * Public API helper that returns the full session data including tokens.
 * Never throws on unauthenticated requests. Uses request-scoped caching
 * to avoid redundant cookie parse + decrypt operations.
 *
 * @param c - Hono context
 * @returns SessionData with user, tokens, and custom fields, or null
 *
 * @example
 * ```typescript
 * const session = await getSession(c)
 * if (session) {
 *   console.log(session.user.email)      // 'user@example.com'
 *   console.log(session.idToken)         // JWT string or undefined
 *   console.log(session['custom_field']) // enriched fields
 * }
 * ```
 *
 * @see getUser - Synchronous variant that throws if unauthenticated
 * @see updateSession - Merge custom data into session
 */
export async function getSession(c: Context): Promise<SessionData | null> {
  return getCachedSession(c)
}
