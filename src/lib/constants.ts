/**
 * Internal cache key for request-scoped session storage.
 *
 * Stores `SessionData | null` to avoid duplicate cookie parse + AES decrypt operations
 * within a single request. Cache is checked by:
 * - `getCachedSession()` — initial load
 * - `getAccessToken()` — invalidates after refresh
 * - `updateSession()` — invalidates after persist
 *
 * @see getCachedSession in src/helpers/sessionCache.ts
 * @see invalidateSessionCache in src/helpers/sessionCache.ts
 */
export const SESSION_CACHE_KEY = '__auth0_session_cache'

/**
 * Internal cache key for promise-based token refresh deduplication.
 *
 * Stores `Map<audience, Promise<TokenSet>>` to prevent concurrent refresh requests
 * for the same audience within a single request. Used by `getAccessToken()` to deduplicate
 * multiple handlers requesting tokens simultaneously.
 *
 * @see getAccessToken in src/helpers/getAccessToken.ts
 */
export const REFRESH_CACHE_KEY = '__auth0_refresh_promises'

/**
 * Internal cache key for retained StateStore reference.
 *
 * Stores the `StateStore<Context>` instance created during client initialization.
 * This reference is retained by `persistSession()` and `updateSession()` to write
 * session mutations back to the store without access to the ServerClient (which
 * stores the store as a private field).
 *
 * Set by: `auth0()` middleware during initialization
 * Retrieved by: `persistSession()` in session mutation helpers
 *
 * @see persistSession in src/helpers/persistSession.ts
 * @see auth0() middleware in src/auth.ts
 */
export const STATE_STORE_KEY = '__auth0_state_store'

/**
 * Reserved session field names that cannot be overwritten via `updateSession()`.
 *
 * These fields are critical for authentication and session management:
 * - `user`: OIDC user claims from ID token (read-only)
 * - `idToken`: Raw ID token JWT string (read-only)
 * - `refreshToken`: Refresh token from Auth0 (read-only, updated only via refresh flow)
 * - `tokenSets`: Array of access token objects for multiple audiences (read-only)
 * - `connectionTokenSets`: Connection-specific token sets (read-only)
 * - `internal`: Session metadata { sid, createdAt } critical for session ID tracking and expiry
 *
 * Custom fields added via enrichment (onCallback hook) or `updateSession()` are stored
 * in the session but alongside these reserved fields. The `RESERVED_FIELDS` set ensures
 * developers cannot accidentally overwrite authentication state.
 *
 * @see updateSession in src/helpers/updateSession.ts
 */
export const RESERVED_FIELDS = new Set([
  'user',
  'idToken',
  'refreshToken',
  'tokenSets',
  'connectionTokenSets',
  'internal',
])
