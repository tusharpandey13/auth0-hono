import { Context, MiddlewareHandler, Next } from 'hono'
import { Auth0Error } from '@/errors/Auth0Error.js'

/**
 * Middleware: verifies a user claim (array) includes at least one value.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if claim is not an array or does not include any of the required values.
 *
 * @param claim - The claim name to check (must be an array)
 * @param values - One or more values to check for in the array
 *
 * @example
 * ```typescript
 * app.use('/org', claimIncludes('permissions', 'read:data', 'write:data'))
 * // Allows access if user.permissions includes either 'read:data' or 'write:data'
 * ```
 */
export function claimIncludes(
  claim: string,
  ...values: string[]
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

    // Get claim value
    const claimValue = user[claim]

    // Verify claim is an array
    if (!Array.isArray(claimValue)) {
      throw new Auth0Error(
        `Claim "${claim}" is not an array`,
        403,
        'insufficient_claims'
      )
    }

    // Check if ANY of the required values are in the array
    const hasMatch = values.some(v => claimValue.includes(v))
    if (!hasMatch) {
      throw new Auth0Error(
        `Claim "${claim}" does not include any of the required values`,
        403,
        'insufficient_claims'
      )
    }

    // At least one value matches — continue
    return next()
  }
}
