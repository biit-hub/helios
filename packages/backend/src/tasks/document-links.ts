import { fromMarkdown } from "mdast-util-from-markdown";
import { nodeText } from "./markdown-section";
import { WorkFault } from "../work/service";
import type { DocumentChange } from "@helios/contracts";
export function safeDocumentUrl(value: string) {
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const u = new URL(value);
    return (
      ["https:", "http:", "obsidian:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (u.protocol === "obsidian:"
        ? ["open", "advanced-uri"].includes(u.hostname)
        : !!u.hostname)
    );
  } catch {
    return false;
  }
}
export function descriptionLinks(description: string) {
  const root = fromMarkdown(description),
    definitions = new Map<string, string>();
  for (const n of root.children)
    if (n.type === "definition")
      definitions.set(n.identifier.toLowerCase(), n.url);
  const found: { url: string; label: string }[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type: string;
      url?: string;
      identifier?: string;
      children?: unknown[];
    };
    const url = linkUrl(n, definitions);
    if (url && safeDocumentUrl(url))
      found.push({ url, label: nodeText(n) || url });
    for (const c of n.children ?? []) visit(c);
  }
  visit(root);
  return found;
}
function escapeLabel(text: string) {
  return text.replace(/[\\[\]]/g, "\\$&");
}
function appendLink(text: string, link: string) {
  if (!text) return link;
  let lastHeadingText = "";
  for (const node of fromMarkdown(text).children)
    if (node.type === "heading" && node.depth <= 2)
      lastHeadingText = nodeText(node);
  const protectedTail = ["Ziel", "Checkliste"].includes(lastHeadingText);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const heading = protectedTail ? "## Dokumentenlinks" + newline : "";
  return text + newline + newline + heading + link;
}
export function patchLink(
  text: string,
  change: Extract<DocumentChange, { kind: "link-add" | "link-edit" }>,
) {
  if (!safeDocumentUrl(change.url) || /[\r\n]/.test(change.label))
    throw new WorkFault("DOCUMENT_LINK_INVALID", 409);
  const link =
    "[" +
    escapeLabel(change.label) +
    "](<" +
    change.url.replaceAll(">", "%3E").replaceAll("<", "%3C") +
    ">)";
  if (change.kind === "link-add") return appendLink(text, link);
  else {
    const target = change.target,
      root = fromMarkdown(text),
      definitions = new Map<string, string>();
    for (const n of root.children)
      if (n.type === "definition")
        definitions.set(n.identifier.toLowerCase(), n.url);
    const matches: { start: number; end: number }[] = [];
    function visit(node: unknown) {
      if (!node || typeof node !== "object") return;
      const n = node as {
        type: string;
        url?: string;
        identifier?: string;
        children?: unknown[];
        position?: { start: { offset: number }; end: { offset: number } };
      };
      const url = linkUrl(n, definitions);
      if (url === target && n.position)
        matches.push({
          start: n.position.start.offset,
          end: n.position.end.offset,
        });
      for (const c of n.children ?? []) visit(c);
    }
    visit(root);
    if (matches.length !== 1) throw new WorkFault("MARKDOWN_AMBIGUOUS", 409);
    const m = matches[0]!;
    return text.slice(0, m.start) + link + text.slice(m.end);
  }
}

function linkUrl(
  n: { type: string; url?: string; identifier?: string },
  definitions: Map<string, string>,
) {
  if (n.type === "link") return n.url;
  if (n.type === "linkReference")
    return definitions.get(n.identifier!.toLowerCase());
  return undefined;
}
