import { env } from 'hono/adapter'
import { Context } from 'hono'
import { Auth0Error } from '@/errors/index.js'
import { initializeOidcClient } from '@/lib/client.js'
import { STATE_STORE_KEY } from '@/lib/constants.js'
import { Configuration, InitConfiguration } from './Configuration.js'
import { ConfigurationSchema } from './Schema.js'
import { assignFromEnv } from './envConfig.js'

const parsedConfig = new Map<InitConfiguration, Configuration>()

/**
 * Parse and validate configuration with caching.
 * Reuses parsed config object if input is the same reference.
 */
export const parseConfiguration = (
  config: InitConfiguration,
): Configuration => {
  if (parsedConfig.has(config)) {
    return parsedConfig.get(config)!
  }
  const result = ConfigurationSchema.parse(config) as Configuration
  parsedConfig.set(config, result)
  return result
}

export { assignFromEnv } from '@/config/envConfig.js'

/**
 * Get initialized Auth0 client and configuration from context.
 * Throws if not initialized (must call ensureClient first or use auth0() middleware).
 *
 * Accepts plain Context to support standalone handlers that call ensureClient(c) first.
 * Runtime checks verify variables are present; no type augmentation required.
 *
 * @throws Auth0Error if client or configuration not in context
 */
export const getClient = (c: Context) => {
  if (!c.var.auth0Client || !c.var.auth0Configuration) {
    throw new Auth0Error(
      'Auth0 client not initialized. Ensure auth0() middleware is registered.',
      500,
      'configuration_error',
    )
  }
  return {
    client: c.var.auth0Client,
    configuration: c.var.auth0Configuration,
  }
}

/**
 * Initialize Auth0 client from runtime environment (for standalone handlers).
 *
 * If client is already initialized (by auth0() middleware), this is a no-op.
 * Otherwise, reads configuration from env(c) and initializes the client.
 *
 * Used by standalone handler wrappers (handleLogin, handleLogout, etc.)
 * to enable use without auth0() middleware.
 *
 * @param c - Hono context
 * @throws Auth0Error if configuration is invalid or incomplete
 */
export async function ensureClient(c: Context): Promise<void> {
  // If already initialized by auth0() middleware, do nothing
  if (c.var.auth0Client) {
    return
  }

  // Initialize from runtime environment (no process.env!)
  const runtimeEnv = env(c)
  const withEnvVars = assignFromEnv({}, runtimeEnv)
  const config = parseConfiguration(withEnvVars)
  const bundle = initializeOidcClient(config)

  // Set context variables for standalone mode
  c.set('auth0Client', bundle.serverClient)
  c.set('auth0Configuration', config)
  c.set(STATE_STORE_KEY, bundle.stateStore)
}
