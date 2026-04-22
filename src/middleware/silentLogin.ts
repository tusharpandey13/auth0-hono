import { getClient } from "@/config/index.js";
import { OIDCEnv } from "@/lib/honoEnv.js";
import { Context } from "hono";
import { accepts } from "hono/accepts";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { CookieOptions } from "hono/utils/cookie";
import { login } from "./login.js";

const COOKIE_NAME = "oidc_skip_silent_login";

const getCookieOptions = (c: Context<OIDCEnv>): CookieOptions => {
  const { configuration } = getClient(c);
  let cookieOptions: CookieOptions | undefined =
    typeof configuration.session === "object"
      ? configuration.session.cookie
      : undefined;

  if (!cookieOptions) {
    cookieOptions = {
      sameSite: "Lax",
      path: "/",
      httpOnly: true,
    };
  }

  return cookieOptions;
};

/**
 * Cancel silent login attempts by setting a cookie.
 * This prevents automatic silent login attempts on the next request.
 */
export const cancelSilentLogin = () =>
  createMiddleware(async (c) => {
    setCookie(c, COOKIE_NAME, 'true', getCookieOptions(c))
  })

/**
 * @deprecated Use cancelSilentLogin instead.
 */
export const pauseSilentLogin = cancelSilentLogin

export const resumeSilentLogin = () =>
  createMiddleware(async (c) => {
    deleteCookie(c, COOKIE_NAME, getCookieOptions(c))
  })

export const attemptSilentLogin = () => {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    const { client } = getClient(c);
    const session = await client.getSession(c);

    const acceptsHTML =
      accepts(c, {
        header: "Accept",
        supports: ["text/html", "application/json"],
        default: "application/json",
      }) === "text/html";

    const hasSkipCookie = getCookie(c, COOKIE_NAME);

    const skipSilentLogin = hasSkipCookie || !!session || !acceptsHTML;

    if (skipSilentLogin) {
      return next();
    }

    // Set skip cookie first (prevent infinite retry loops)
    await cancelSilentLogin()(c, next);

    try {
      return await login({ silent: true })(c, next);
    } catch (err) {
      // Login failed — clear the skip cookie so user can retry later
      // This allows recovery if silent login temporarily fails
      deleteCookie(c, COOKIE_NAME, getCookieOptions(c));
      throw err;  // Let error propagate (user sees appropriate error)
    }
  });
};
