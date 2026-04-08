// Import core error class for re-export
import { Auth0Error } from './Auth0Error.js'

// Core error class
export { Auth0Error } from './Auth0Error.js'

// Error subclasses
export {
  AccessDeniedError,
  LoginRequiredError,
  InvalidGrantError,
  MissingSessionError,
  MissingTransactionError,
  TokenRefreshError,
  ConnectionTokenError,
} from './errors.js'

// Error mapper for server-js errors
export { mapServerError } from './errorMap.js'

/**
 * @deprecated Use Auth0Error instead. This alias is maintained for backward compatibility.
 */
export const Auth0Exception = Auth0Error
