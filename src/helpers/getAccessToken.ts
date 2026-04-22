import { Context } from 'hono'
import { TokenSet } from '@auth0/auth0-server-js'
import { REFRESH_CACHE_KEY } from '@/lib/constants.js'
import { getClient } from '@/config/index.js'
import { mapServerError } from '@/errors/errorMap.js'
import { invalidateSessionCache } from './sessionCache.js'

/**
 * Re-export server-js TokenSet as public return type.
 */
export type Auth0TokenSet = TokenSet

/**
 * Options for getAccessToken helper.
 */
export interface GetAccessTokenOptions {
  /**
   * Optional audience for the access token.
   */
  audience?: string
}

/**
 * Get an access token, auto-refreshing if expired.
 *
 * Public API helper with intelligent caching:
 * - Promise-based deduplication per audience within a request (prevents concurrent refreshes)
 * - Auto-refresh if token is expired
 * - Session cache invalidation after refresh
 * - Proper error mapping
 *
 * @param c - Hono context
 * @param options - Optional audience override
 * @returns Auth0TokenSet with accessToken string and metadata
 * @throws Auth0Error (mapped from server-js errors)
 *
 * @example
 * ```typescript
 * try {
 *   const token = await getAccessToken(c)
 *   console.log(token.accessToken)  // JWT string
 *   console.log(token.expiresAt)    // Unix timestamp
 *
 *   // For specific audience
 *   const apiToken = await getAccessToken(c, { audience: 'https://api.example.com' })
 * } catch (err) {
 *   if (err instanceof InvalidGrantError) {
 *     // Refresh token is invalid or revoked
 *   }
 * }
 * ```
 *
 * @see getAccessTokenForConnection - Get token for a specific connection/provider
 * @see updateSession - Merge custom data into session
 */
export async function getAccessToken(
  c: Context,
  options?: GetAccessTokenOptions
): Promise<Auth0TokenSet> {
  const { client } = getClient(c)

  // Create cache key based on audience (or default if not specified)
  // Use robust key format to prevent collision: if audience is literal '__no_audience__', still unique
  const cacheKey = options?.audience ? `aud:${options.audience}` : 'aud:'

  // Get or initialize refresh promise cache for this request
  let refreshCache = c.get(REFRESH_CACHE_KEY) as Map<string, Promise<TokenSet>> | undefined
  if (!refreshCache) {
    refreshCache = new Map()
    c.set(REFRESH_CACHE_KEY, refreshCache)
  }

  // Check if another handler is already refreshing this audience
  let promise = refreshCache.get(cacheKey)
  if (!promise) {
    // No in-flight refresh — create new promise
    // server-js client.getAccessToken() handles:
    // - Checking token expiry
    // - Refreshing if needed
    // - Persisting new token to state store
    // - Returning full TokenSet (not just string)
    promise = client.getAccessToken(c)

    // Cache the promise so concurrent calls await the same refresh
    refreshCache.set(cacheKey, promise)
  }

  // Wait for refresh (whether cached or in-flight)
  try {
    const tokenSet = await promise

    // After refresh, session may have changed (new tokens)
    // Invalidate session cache so next getSession() reloads
    invalidateSessionCache(c)

    return tokenSet
  } catch (err) {
    // Map server-js error to SDK error
    throw mapServerError(err)
  }
}
