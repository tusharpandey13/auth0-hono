import { CookieHandler, CookieSerializeOptions } from "@auth0/auth0-server-js";
import { AsyncLocalStorage } from "async_hooks";
import { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { CookieOptions } from "hono/utils/cookie";

function capitalize<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class HonoCookieHandler implements CookieHandler<any> {
  private static localStore = new AsyncLocalStorage<Context>();

  static setContext<R>(context: Context, callback: () => R): R {
    return this.localStore.run(context, callback);
  }

  /**
   * Resolve context: storeOptions first, ALS fallback.
   * storeOptions is passed by server-js on every method call.
   */
  private getContext(storeOptions?: Context): Context {
    const ctx = storeOptions ?? HonoCookieHandler.localStore.getStore();
    if (!ctx) {
      throw new Error(
        "No Hono Context available. Ensure auth0() middleware is registered."
      );
    }
    return ctx;
  }

  getCookies(storeOptions?: Context): Record<string, string> {
    const { req } = this.getContext(storeOptions);
    return Object.fromEntries(
      (req.header("Cookie") ?? "").split(";").map((cookie) => {
        const [key, ...val] = cookie.trim().split("=");
        return [key, decodeURIComponent(val.join("="))];
      }),
    );
  }

  setCookie(
    name: string,
    value: string,
    options?: CookieSerializeOptions,
    storeOptions?: Context,
  ): string {
    const cookieOptions: CookieOptions | undefined = options
      ? {
          ...options,
          sameSite: options.sameSite ? capitalize(options.sameSite) : undefined,
          priority: options.priority ? capitalize(options.priority) : undefined,
        }
      : undefined;
    const ctx = this.getContext(storeOptions);
    setCookie(ctx, name, value, cookieOptions);
    return value;
  }

  getCookie(name: string, storeOptions?: Context): string | undefined {
    const ctx = this.getContext(storeOptions);
    return getCookie(ctx, name);
  }

  deleteCookie(name: string, storeOptions?: Context): void {
    const ctx = this.getContext(storeOptions);
    setCookie(ctx, name, "", { path: "/", maxAge: 0 });
  }
}
