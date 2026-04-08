import { OIDCAuthorizationRequestParams } from '@/config/authRequest.js'
import { getClient, ensureClient } from '@/config/index.js'
import { OIDCEnv } from '@/lib/honoEnv.js'
import { toSafeRedirect } from '@/utils/util.js'
import { mapServerError } from '@/errors/errorMap.js'
import { createMiddleware } from 'hono/factory'
import { MiddlewareHandler } from 'hono'

export type LoginParams = {
  /**
   * The URL to redirect to after login.
   * This is stored in session.oidc_tx.returnTo
   * and used in the callback handler.
   *
   * If not set, defaults to the value of the `return_to` query parameter.
   *
   * If neither is set, defaults to '/'.
   * @example '/home'
   * @default '/'
   */
  redirectAfterLogin?: string;

  /**
   * Whether to suppress the login prompt.
   * This is stored in session.oidc_tx.silent
   * and used in the callback handler.
   *
   * @example true
   * @default false
   */
  silent?: boolean;

  /**
   * Override authorization parameters.
   *
   * @example { prompt: 'none' }
   * @default undefined
   */
  authorizationParams?: Partial<OIDCAuthorizationRequestParams>;

  /**
   * Forwards specific query parameters from the login request to the authorization request.
   * This allows passing through parameters like 'ui_locales', 'acr_values', or custom parameters
   * that your identity provider supports without having to specify them in authorizationParams.
   *
   * Only parameters with non-empty values will be forwarded.
   *
   * @example ['ui_locales', 'acr_values', 'login_hint']
   * @example ['locale', 'campaign']
   * @default []
   */
  forwardAuthorizationParams?: string[];
};

/**
 * Handle login requests.
 *
 * Initiates the authorization flow with Auth0, optionally with custom
 * authorization parameters and redirect URL.
 */
export const login = (params: LoginParams = {}) => {
  return createMiddleware<OIDCEnv>(async function (c) {
    try {
      const { client, configuration } = getClient(c)
      const { debug } = configuration

      // Get the potential return URL
      const potentialReturnTo =
        params.redirectAfterLogin ??
        (c.req.method === 'GET' && c.req.path !== configuration.routes.login
          ? c.req.url
          : undefined) ??
        c.req.query('return_to') ??
        '/'

      // Validate the URL to prevent open redirects
      const returnTo = toSafeRedirect(
        potentialReturnTo,
        configuration.baseURL,
      )

      const paramsFromQuery: Record<string, string> = {}

      const forwardParams =
        params.forwardAuthorizationParams ??
        configuration.forwardAuthorizationParams

      if (forwardParams && forwardParams.length > 0) {
        for (const param of forwardParams) {
          const value = c.req.query(param)
          if (value) {
            paramsFromQuery[param] = value
          }
        }
      }

      const authParams: Partial<OIDCAuthorizationRequestParams> = {
        ...(params.authorizationParams ?? {}),
        ...paramsFromQuery,
      }

      if (params.silent) {
        authParams.prompt = 'none'
      }

      debug('Starting login flow with:', authParams)

      const authorizationUrl = await client.startInteractiveLogin(
        {
          pushedAuthorizationRequests:
            configuration.pushedAuthorizationRequests,
          appState: { returnTo },
          authorizationParams: authParams,
        },
        c,
      )

      return c.redirect(authorizationUrl.href)
    } catch (err) {
      throw mapServerError(err)
    }
  })
}

/**
 * Standalone login handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleLogin(params?: LoginParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c)
    // Delegate to internal login handler
    return login(params)(c, next)
  })
}
