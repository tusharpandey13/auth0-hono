import { Context } from 'hono'
import { RESERVED_FIELDS, SESSION_CACHE_KEY } from '@/lib/constants.js'
import { getCachedSession } from './sessionCache.js'
import { persistSession } from './persistSession.js'
import { Auth0Session, Auth0User } from '@/types/auth0.js'
import { MissingSessionError } from '@/errors/index.js'

/**
 * Merge custom data into the session and persist.
 *
 * Public API helper for enriching session with custom fields. Updates are persisted
 * to the session store (encrypted cookie or database) and reflected in context for
 * subsequent handlers.
 *
 * Reserved fields (user, idToken, refreshToken, tokenSets, internal) are protected
 * from accidental overwrite to preserve authentication state.
 *
 * @param c - Hono context
 * @param data - Custom data object to merge (keys matching RESERVED_FIELDS are filtered)
 * @throws MissingSessionError if no active session
 * @throws Auth0Error if session persistence fails
 *
 * @example
 * ```typescript
 * app.use('/api/*', requiresAuth())
 *
 * app.post('/api/profile', async (c) => {
 *   const { theme, language } = await c.req.json()
 *
 *   await updateSession(c, {
 *     preferences: { theme, language },
 *     lastUpdated: new Date().toISOString()
 *   })
 *
 *   // Updated session available in handlers
 *   const session = await getSession(c)
 *   console.log(session.preferences)  // { theme, language }
 * })
 * ```
 *
 * @see getSession - Read the full session
 * @see getUser - Get user claims
 * @see RESERVED_FIELDS - Fields protected from overwrite
 */
export async function updateSession(
  c: Context,
  data: Record<string, unknown>
): Promise<void> {
  // Load current session (required)
  const session = await getCachedSession(c)
  if (!session) {
    throw new MissingSessionError('updateSession() called without an active session.')
  }

  // Filter out reserved fields (prevent accidental overwrite)
  const safeData = Object.fromEntries(
    Object.entries(data).filter(([key]) => !RESERVED_FIELDS.has(key))
  )

  // Merge custom data onto existing session
  // This preserves: user, idToken, refreshToken, tokenSets, connectionTokenSets, internal
  const updatedSession = { ...session, ...safeData }

  // Persist updated session to store (via retained state store reference)
  await persistSession(c, updatedSession)

  // Update request-scoped cache
  // TypeScript cannot resolve const string keys against ContextVariableMap augmentation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(c as any).set(SESSION_CACHE_KEY, updatedSession)

  // Update c.var.auth0 context (so subsequent handlers see new data)
  const updatedUser = updatedSession.user
  const org = updatedUser?.org_id
    ? { id: updatedUser.org_id as string, name: updatedUser.org_name as string | undefined }
    : null

  c.set('auth0', {
    user: (updatedUser as Auth0User) ?? null,
    session: updatedSession as Auth0Session,
    org,
  })
}
