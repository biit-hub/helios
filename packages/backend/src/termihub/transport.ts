import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

export class TermiHubFault extends Error {
  constructor(
    public code: string,
    public status = 502,
    public retryAfterSeconds = 30,
  ) {
    super(code);
  }
}
export type TermiHubNetworkConfig = {
  timeoutMs: number;
  maxBytes: number;
  privateOrigins: string[];
  fixtureOrigin: string | null;
};
export function networkConfig(
  env: NodeJS.ProcessEnv = process.env,
): TermiHubNetworkConfig {
  const timeoutMs = Number(env.TERMIHUB_TIMEOUT_SECONDS ?? 10) * 1000;
  const maxBytes = Number(env.TERMIHUB_MAX_RESPONSE_BYTES ?? 2097152);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 30000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 16384 ||
    maxBytes > 8388608
  )
    throw new Error("Invalid TermiHub network limits");
  const privateOrigins = (env.TERMIHUB_PRIVATE_ORIGINS ?? "")
    .split(",")
    .filter(Boolean)
    .map((raw) => {
      const u = cleanOrigin(raw.trim());
      if (u.protocol !== "https:")
        throw new Error("TermiHub private origins require HTTPS");
      return u.origin;
    });
  let fixtureOrigin: string | null = null;
  if (env.TERMIHUB_TEST_ORIGIN) {
    const u = cleanOrigin(env.TERMIHUB_TEST_ORIGIN);
    if (
      env.HELIOS_ENV !== "test" ||
      u.protocol !== "http:" ||
      u.hostname !== "127.0.0.1"
    )
      throw new Error("TermiHub fixture origin is test-loopback only");
    fixtureOrigin = u.origin;
  }
  return { timeoutMs, maxBytes, privateOrigins, fixtureOrigin };
}
export function cleanOrigin(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new TermiHubFault("TERMIHUB_URL_INVALID", 400);
  }
  if (
    !raw ||
    raw.length > 2048 ||
    /[\s\u0000-\u001f\u007f]/.test(raw) ||
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw new TermiHubFault("TERMIHUB_URL_INVALID", 400);
  return u;
}
type AddressKind = "public" | "private" | "unsafe";
function ipv4Kind(address: string): AddressKind {
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  if (
    a === 0 ||
    a === 127 ||
    a >= 224 ||
    address === "168.63.129.16" ||
    address === "100.100.100.200" ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 169 && b === 254) ||
    (a === 198 && (b === 18 || b === 19))
  )
    return "unsafe";
  if (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
    return "private";
  return "public";
}
export function addressKind(address: string): AddressKind {
  if (isIP(address) === 4) return ipv4Kind(address);
  if (isIP(address) !== 6 || address.includes("%")) return "unsafe";
  const first = Number.parseInt(address.split(":")[0] || "0", 16);
  const second = Number.parseInt(address.split(":")[1] || "0", 16);
  // Only global unicast and explicitly allowed ULA; reject mapped IPv4,
  // link-local, NAT64, multicast and transition mechanisms.
  if (first >= 0xfc00 && first <= 0xfdff) return "private";
  if (
    first < 0x2000 ||
    first > 0x3fff ||
    first === 0x2002 ||
    (first === 0x2001 && (second === 0 || second === 0xdb8))
  )
    return "unsafe";
  return "public";
}
export type Resolver = (
  host: string,
) => Promise<{ address: string; family: number }[]>;
const defaultResolver: Resolver = (host) =>
  lookup(host, { all: true, verbatim: true });
export async function resolveTarget(
  base: string,
  config: TermiHubNetworkConfig,
  resolver: Resolver = defaultResolver,
) {
  const u = cleanOrigin(base);
  const fixture = config.fixtureOrigin === u.origin;
  if (!fixture && u.protocol !== "https:")
    throw new TermiHubFault("TERMIHUB_URL_BLOCKED", 400);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const allowPrivate = config.privateOrigins.includes(u.origin);
  if (
    !fixture &&
    (/^(?:localhost|metadata\.google\.internal)$/i.test(host) ||
      /\.localhost$/i.test(host) ||
      (!allowPrivate && /\.(?:local|internal)$/i.test(host)))
  )
    throw new TermiHubFault("TERMIHUB_URL_BLOCKED", 400);
  if (!fixture && u.port && u.port !== "443" && !allowPrivate)
    throw new TermiHubFault("TERMIHUB_URL_BLOCKED", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      isIP(host)
        ? Promise.resolve([{ address: host, family: isIP(host) }])
        : resolver(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new TermiHubFault("TERMIHUB_TIMEOUT")),
          config.timeoutMs,
        );
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some(
        (a) =>
          !fixture &&
          (addressKind(a.address) === "unsafe" ||
            (addressKind(a.address) === "private" && !allowPrivate)),
      )
    )
      throw new TermiHubFault("TERMIHUB_URL_BLOCKED", 400);
    return {
      url: u,
      pinned: addresses.find((a) => a.family === 4) ?? addresses[0]!,
    };
  } catch (e) {
    if (e instanceof TermiHubFault) throw e;
    throw new TermiHubFault("TERMIHUB_UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
}
export type TermiHubTransport = (
  base: string,
  path: string,
  query: URLSearchParams,
  token: string,
) => Promise<unknown>;
const allowedPaths = new Set([
  "calendars",
  "events",
  "work-locations",
  "work-locations/current",
  "travel",
]);
function statusFault(status: number, retry: string | undefined) {
  const seconds =
    retry && /^\d+$/.test(retry) ? Math.min(Number(retry), 3600) : 30;
  if (status === 401) return new TermiHubFault("TERMIHUB_AUTH", 401);
  if (status === 403) return new TermiHubFault("TERMIHUB_PERMISSION", 403);
  if (status === 429)
    return new TermiHubFault("TERMIHUB_RATE_LIMIT", 429, seconds);
  return new TermiHubFault(
    status >= 300 && status < 400 ? "TERMIHUB_REDIRECT" : "TERMIHUB_RESPONSE",
  );
}
export function createTransport(
  config: TermiHubNetworkConfig,
  resolver: Resolver = defaultResolver,
): TermiHubTransport {
  return async (base, path, query, token) => {
    if (
      !allowedPaths.has(path) ||
      !token ||
      token.length > 4096 ||
      /[\r\n\u0000]/.test(token)
    )
      throw new TermiHubFault("TERMIHUB_REQUEST_INVALID", 400);
    const { url, pinned } = await resolveTarget(base, config, resolver);
    url.pathname = "/api/v1/external/" + path;
    url.search = query.toString();
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error: TermiHubFault | null, value?: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const send = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = send(
        url,
        {
          method: "GET",
          agent: false,
          family: pinned.family,
          lookup: (_host, _options, callback) =>
            callback(null, pinned.address, pinned.family),
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            finish(
              statusFault(res.statusCode ?? 0, res.headers["retry-after"]),
            );
            res.destroy();
            return;
          }
          if (Number(res.headers["content-length"] ?? 0) > config.maxBytes) {
            finish(new TermiHubFault("TERMIHUB_TOO_LARGE"));
            res.destroy();
            return;
          }
          if (
            !/^application\/json(?:;|$)/i.test(
              res.headers["content-type"] ?? "",
            )
          ) {
            finish(new TermiHubFault("TERMIHUB_CONTRACT"));
            res.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > config.maxBytes) {
              finish(new TermiHubFault("TERMIHUB_TOO_LARGE"));
              res.destroy();
            } else chunks.push(chunk);
          });
          res.on("error", () =>
            finish(new TermiHubFault("TERMIHUB_UNREACHABLE")),
          );
          res.on("end", () => {
            try {
              finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
              finish(new TermiHubFault("TERMIHUB_CONTRACT"));
            }
          });
        },
      );
      const timer = setTimeout(() => {
        finish(new TermiHubFault("TERMIHUB_TIMEOUT"));
        req.destroy();
      }, config.timeoutMs);
      req.on("error", () => finish(new TermiHubFault("TERMIHUB_UNREACHABLE")));
      req.end();
    });
  };
}
