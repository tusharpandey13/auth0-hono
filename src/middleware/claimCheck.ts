import { Context, MiddlewareHandler, Next } from 'hono'
import { Auth0Error } from '@/errors/Auth0Error.js'
import { Auth0User } from '@/types/auth0.js'

/**
 * Middleware: verifies a custom predicate function returns true for the user.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if the predicate function returns false.
 *
 * @param fn - Synchronous predicate function that receives the user object
 *
 * @example
 * ```typescript
 * app.use('/premium', claimCheck((user) => {
 *   return user.subscription === 'premium' && user.email_verified === true
 * }))
 * ```
 */
export function claimCheck(
  fn: (user: Auth0User) => boolean
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Get user from context
    const user = c.var.auth0?.user

    // Require authentication
    if (!user) {
      throw new Auth0Error(
        'Authentication required',
        403,
        'access_denied'
      )
    }

    // Call predicate function (must be synchronous)
    if (!fn(user)) {
      throw new Auth0Error(
        'Custom claim check failed',
        403,
        'insufficient_claims'
      )
    }

    // Predicate passed — continue
    return next()
  }
}
