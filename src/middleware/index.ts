// Internal middleware handlers
export { backchannelLogout } from './backchannelLogout.js'
export { callback } from './callback.js'
export { login } from './login.js'
export { logout } from './logout.js'
export { requiresAuth } from './requiresAuth.js'

// Standalone handler wrappers
export { handleBackchannelLogout } from './backchannelLogout.js'
export { handleCallback } from './callback.js'
export { handleLogin } from './login.js'
export { handleLogout } from './logout.js'

//export all middlewares in this file
export {
  attemptSilentLogin,
  cancelSilentLogin,
  pauseSilentLogin,
  resumeSilentLogin,
} from './silentLogin.js'

// Authorization middleware
export { claimEquals } from "./claimEquals.js";
export { claimIncludes } from "./claimIncludes.js";
export { claimCheck } from "./claimCheck.js";
export { requiresOrg } from "./requiresOrg.js";
