import { Context } from 'hono'
import { Auth0User } from '@/types/auth0.js'
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
