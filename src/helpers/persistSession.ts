import { Context } from 'hono'
import { SessionData, StateData, StateStore } from '@auth0/auth0-server-js'
import { STATE_STORE_KEY } from '@/lib/constants.js'

/**
 * Persist modified session data back to state store via retained reference.
 *
 * Called by updateSession() and onCallback enrichment to write session mutations.
 * Uses the retained StateStore reference set by auth0() middleware during init.
 *
 * @param c - Hono context
 * @param session - SessionData with custom fields (must include internal field from original StateData)
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
