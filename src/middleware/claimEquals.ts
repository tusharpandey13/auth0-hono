import { Context, MiddlewareHandler, Next } from 'hono'
import { Auth0Error } from '@/errors/Auth0Error.js'

/**
 * Middleware: verifies a user claim matches exactly.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if claim value does not match.
 *
 * @param claim - The claim name to check (e.g., 'role', 'department')
 * @param value - The expected value (string, number, boolean, or null)
 *
 * @example
 * ```typescript
 * app.use('/admin', claimEquals('role', 'admin'))
 * app.use('/billing', claimEquals('email_verified', true))
 * ```
 */
export function claimEquals(
  claim: string,
  value: string | number | boolean | null
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Get user from context (populated by auth0() middleware)
    const user = c.var.auth0?.user

    // Require authentication (this middleware must run after requiresAuth())
    if (!user) {
      throw new Auth0Error(
        'Authentication required',
        403,
        'access_denied'
      )
    }

    // Check claim value
    if (user[claim] !== value) {
      throw new Auth0Error(
        `Claim "${claim}" does not match expected value`,
        403,
        'insufficient_claims',
        { description: `Expected ${claim} to equal ${JSON.stringify(value)}` }
      )
    }

    // Claim matches — continue
    return next()
  }
}
