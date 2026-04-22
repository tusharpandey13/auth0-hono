import { Context } from 'hono'
import { SessionData, StateData, StateStore } from '@auth0/auth0-server-js'
import { RESERVED_FIELDS, STATE_STORE_KEY } from '@/lib/constants.js'
import { getCachedSession } from './sessionCache.js'
import { Auth0Session, Auth0User } from '@/types/auth0.js'
import { MissingSessionError } from '@/errors/index.js'

/**
 * Get the current user or throw if not authenticated.
 *
 * Public API helper that synchronously returns user claims from c.var.auth0.user.
 * Throws MissingSessionError with a helpful message if user is not authenticated.
 *
 * Use this helper to enforce authentication and get type-safe user access in handlers.
 * For optional authentication, use c.var.auth0.user with a null check instead.
 *
 * @param c - Hono context (should have auth0() middleware registered before this handler)
 * @returns Auth0User with claims (sub, email, org_id, custom claims, etc.)
 * @throws MissingSessionError if user is not authenticated
 *
 * @example
 * ```typescript
 * app.get('/profile', (c) => {
 *   const user = getUser(c)  // Throws if unauthenticated
 *   return c.json({ email: user.email, org: user.org_id })
 * })
 *
 * // Or with optional auth:
 * app.get('/home', (c) => {
 *   const user = c.var.auth0?.user
 *   if (user) {
 *     return c.json({ message: `Welcome ${user.name}` })
 *   }
 *   return c.json({ message: 'Welcome guest' })
 * })
 * ```
 *
 * @see getSession - Async variant that returns full session data
 * @see requiresAuth - Middleware to enforce authentication on routes
 */
export function getUser(c: Context): Auth0User {
  // Read from c.var.auth0.user (populated by auth0() middleware)
  const user = c.var.auth0?.user

  // If no user, throw descriptive error
  if (!user) {
    throw new MissingSessionError(
      'getUser() called on an unauthenticated request. ' +
        'Add requiresAuth() before this handler or use c.var.auth0.user with a null check.'
    )
  }

  return user
}

/**
 * Persist modified session data back to state store.
 * @param c - Hono context
 * @param session - SessionData with custom fields
 * @throws If StateStore or Configuration not in context
 * @internal
 */
export async function persistSession(
  c: Context,
  session: SessionData,
): Promise<void> {
  // Retrieve retained state store reference (set by auth0() middleware during init)
  const stateStore = c.get(STATE_STORE_KEY) as StateStore<Context>

  // Retrieve config for identifier (cookie name)
  const config = c.var.auth0Configuration
  if (!config) {
    throw new Error(
      'Auth0 configuration not found in context. Ensure auth0() middleware is registered.',
    )
  }
  const identifier = config.session.cookie?.name ?? 'appSession'

  // IMPORTANT: Session must include `internal` field from original StateData
  // If updating: merge custom fields onto existing session (preserves internal)
  // The stateStore will handle encryption + cookie setting

  // Call state store to persist (same pattern as server-js internal usage)
  await stateStore.set(
    identifier, // cookie name (= stateIdentifier)
    session as StateData, // session with internal field must be present
    false, // deleteSession flag (false = persist)
    c // context for cookie handler
  )
}

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
  c.set('__auth0_session_cache', updatedSession)

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
