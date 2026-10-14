import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
// Headers only: authorization always remains in the backend/page/service guards.
export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp =
    "default-src 'self'; script-src 'self' 'nonce-" +
    nonce +
    "' 'strict-dynamic'" +
    (dev ? " 'unsafe-eval'" : "") +
    "; style-src 'self' " +
    (dev ? "'unsafe-inline'" : "'nonce-" + nonce + "'") +
    "; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; connect-src 'self'" +
    (dev ? " ws:" : "") +
    ";";
  const h = new Headers(request.headers);
  h.set("x-nonce", nonce);
  h.set("Content-Security-Policy", csp);
  const r = NextResponse.next({ request: { headers: h } });
  r.headers.set("Content-Security-Policy", csp);
  r.headers.set("Cache-Control", "no-store, private");
  return r;
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
