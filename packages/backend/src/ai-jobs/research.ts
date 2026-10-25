import addressPolicy from "./research-address-policy.json";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { z } from "zod";
import { boundedOllamaText } from "../ai/ollama";
import { WorkFault } from "../work/service";
import type { JobInput } from "./generation";
import type { AiJobRow } from "./schema";

export const PUBLIC_SEARCH_QUESTION =
  "Welche kurzen, öffentlichen Suchbegriffe darf Helios für diesen Auftrag an den Suchdienst senden? Bitte keine vertraulichen Angaben eingeben (maximal 300 Zeichen).";
export class ResearchQuestion extends Error {}
export type ResearchSources = (
  job: AiJobRow,
  turns: JobInput["turns"],
  signal: AbortSignal,
) => Promise<JobInput["sources"]>;
// Immutable IANA-derived safety data is audited separately from configured endpoints.
const blocked = new BlockList();
for (const range of addressPolicy.reservedIPv4)
  blocked.addSubnet(range.address, range.prefix, "ipv4");
const public6 = new BlockList();
public6.addSubnet(
  addressPolicy.globalIPv6.address,
  addressPolicy.globalIPv6.prefix,
  "ipv6",
);
const blocked6 = new BlockList();
for (const range of addressPolicy.reservedIPv6)
  blocked6.addSubnet(range.address, range.prefix, "ipv6");
export function publicAddress(address: string) {
  if (isIP(address) === 4) return !blocked.check(address, "ipv4");
  return (
    isIP(address) === 6 &&
    public6.check(address, "ipv6") &&
    !blocked6.check(address, "ipv6")
  );
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    url.href.length > 2048
  )
    throw new WorkFault("AI_JOB_RESEARCH_BLOCKED", 409);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") && !isIP(hostname))
    throw new WorkFault("AI_JOB_RESEARCH_BLOCKED", 409);
  if (isIP(hostname) && !publicAddress(hostname))
    throw new WorkFault("AI_JOB_RESEARCH_BLOCKED", 409);
  return url;
}
export async function readPublicPage(
  value: string,
  signal: AbortSignal,
  hop = 0,
): Promise<{ url: string; text: string }> {
  if (hop > 2) throw new WorkFault("AI_JOB_RESEARCH_BLOCKED", 409);
  const url = publicUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503)),
      5000,
    );
  });
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    timeout,
  ]).finally(() => clearTimeout(timer));
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new WorkFault("AI_JOB_RESEARCH_BLOCKED", 409);
  const pinned = addresses[0]!;
  const result = await new Promise<{ redirect?: string; text?: string }>(
    (resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(
        url,
        {
          method: "GET",
          signal,
          family: pinned.family,
          headers: {
            Accept: "text/html, text/plain",
            "User-Agent": "Helios-Research/1.0",
          },
          lookup: (_host, _options, callback) =>
            callback(null, pinned.address, pinned.family),
        },
        (response) => {
          const status = response.statusCode ?? 500;
          if (
            [301, 302, 303, 307, 308].includes(status) &&
            response.headers.location
          ) {
            response.destroy();
            resolve({ redirect: new URL(response.headers.location, url).href });
            return;
          }
          if (
            status !== 200 ||
            !/^text\/(html|plain)(?:;|$)/i.test(
              response.headers["content-type"] ?? "",
            )
          ) {
            response.destroy();
            reject(new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (part: Buffer) => {
            bytes += part.length;
            if (bytes > 262144) {
              response.destroy(new WorkFault("AI_JOB_RESEARCH_LIMIT", 409));
              return;
            }
            chunks.push(part);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolve({ text: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      request.on("error", reject);
      request.end();
    },
  );
  if (result.redirect) return readPublicPage(result.redirect, signal, hop + 1);
  const text = sourceText(result.text!);
  if (text.length < 30) throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
  return { url: url.href, text };
}
export function sourceText(html: string) {
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let position = 0;
  while (position < html.length) {
    const open = html.indexOf("<", position);
    if (open < 0) {
      parts.push(html.slice(position));
      break;
    }
    parts.push(html.slice(position, open), " ");
    const end = html.indexOf(">", open + 1);
    if (end < 0) break;
    const name = lower
      .slice(open + 1, end)
      .trim()
      .split(/[\s/]/, 1)[0]!;
    position = end + 1;
    if (["script", "style", "noscript"].includes(name)) {
      const close = lower.indexOf("</" + name, position);
      const closeEnd = close < 0 ? -1 : html.indexOf(">", close);
      if (closeEnd < 0) break;
      position = closeEnd + 1;
    }
  }
  return parts
    .join("")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4500);
}
function publicTerms(turns: JobInput["turns"]) {
  let terms: string | undefined;
  for (let i = 0; i < turns.length - 1; i++) {
    if (
      turns[i]!.kind === "question" &&
      turns[i]!.text === PUBLIC_SEARCH_QUESTION &&
      turns[i + 1]!.kind === "answer"
    )
      terms = turns[i + 1]!.text;
  }
  if (!terms || terms.length > 300)
    throw new ResearchQuestion(PUBLIC_SEARCH_QUESTION);
  return terms;
}
async function readCandidates(
  entries: { title: string; url: string }[],
  signal: AbortSignal,
  readPage: typeof readPublicPage,
  index = 0,
  sources: JobInput["sources"] = [],
): Promise<JobInput["sources"]> {
  if (sources.length === 3 || index >= entries.length) return sources;
  const entry = entries[index]!;
  try {
    const page = await readPage(entry.url, signal);
    if (!sources.some((source) => source.url === page.url))
      sources.push({
        ...page,
        title: entry.title,
        retrievedAt: new Date().toISOString(),
      });
  } catch {
    if (signal.aborted) throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
  }
  return readCandidates(entries, signal, readPage, index + 1, sources);
}
export function searchOrigin(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.hostname ||
    url.href.length > 2048
  )
    throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
  return url;
}
export function researchSources(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  readPage = readPublicPage,
): ResearchSources {
  // The trusted operator explicitly selects this origin, including Docker DNS.
  // Search terms are public-only; the private prompt never reaches this service.
  const base = searchOrigin(env.SEARXNG_BASE_URL);
  return async (_job, turns, outerSignal) => {
    if (!base) throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
    const terms = publicTerms(turns);
    const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(30000)]);
    const url = new URL("/search", base);
    url.searchParams.set("q", terms);
    url.searchParams.set("format", "json");
    const response = await fetcher(url, {
      redirect: "error",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
    const result = z
      .object({
        results: z
          .array(
            z.object({ url: z.string().max(2048), title: z.string().max(500) }),
          )
          .max(100),
      })
      .parse(JSON.parse(await boundedOllamaText(response)));
    const sources = await readCandidates(
      result.results.slice(0, 5),
      signal,
      readPage,
    );
    if (!sources.length)
      throw new WorkFault("AI_JOB_RESEARCH_UNAVAILABLE", 503);
    return sources;
  };
}
