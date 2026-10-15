import { fromMarkdown } from "mdast-util-from-markdown";
import { WorkFault } from "../work/service";
const conflict = () => new WorkFault("CHECKLIST_AMBIGUOUS", 409);
function nodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const n = value as { value?: string; children?: unknown[] };
  return n.value ?? n.children?.map(nodeText).join("") ?? "";
}
function section(text: string) {
  const nodes = fromMarkdown(text).children;
  const headings = nodes
    .map((n, index) => ({ n, index }))
    .filter(
      ({ n }) =>
        n.type === "heading" && n.depth === 2 && nodeText(n) === "Checkliste",
    );
  if (
    headings.some(
      ({ n }) =>
        !(
          n.type === "heading" &&
          n.children.length === 1 &&
          n.children[0]?.type === "text"
        ),
    )
  )
    throw conflict();
  if (headings.length > 1) throw conflict();
  const match = headings[0];
  if (!match) return null;
  const start = match.n.position!.end.offset!;
  let end = text.length;
  for (const n of nodes.slice(match.index + 1))
    if (n.type === "heading" && n.depth <= 2) {
      end = n.position!.start.offset!;
      break;
    }
  return { start, end };
}
export function readChecklist(text: string) {
  const s = section(text);
  if (!s) return [];
  const body = text.slice(s.start, s.end);
  if (/\r(?!\n)/.test(body)) throw conflict();
  const rows = [...body.matchAll(/([^\r\n]*)(\r\n|\n|$)/g)];
  const found: {
    text: string;
    checked: boolean;
    start: number;
    marker: number;
  }[] = [];
  for (const row of rows) {
    const line = row[1]!;
    const offset = s.start + row.index;
    if (line.trim()) {
      const m = /^([-*+] \[)([ xX])(\] )(.+)$/.exec(line);
      if (!m) throw conflict();
      const value = m[4]!.trim();
      if (found.some((p) => p.text === value)) throw conflict();
      found.push({
        text: value,
        checked: m[2] !== " ",
        start: offset,
        marker: offset + m[1]!.length,
      });
    }
  }
  return found;
}
export function patchChecklist(
  description: string,
  kind: "check-add" | "check-complete",
  value: string,
  target: string | null,
) {
  if (/[\r\n]/.test(value) || value.length > 500)
    throw new WorkFault("AI_PATCH_INVALID", 409);
  const items = readChecklist(description),
    s = section(description),
    nl = description.includes("\r\n") ? "\r\n" : "\n";
  if (kind === "check-complete") {
    const item = items.find((p) => p.text === target);
    if (!item || item.checked) throw conflict();
    return (
      description.slice(0, item.marker) +
      "x" +
      description.slice(item.marker + 1)
    );
  }
  if (items.some((p) => p.text === value)) throw conflict();
  const line = "- [ ] " + value;
  if (!s)
    return (
      description + (description ? nl + nl : "") + "## Checkliste" + nl + line
    );
  const body = description.slice(s.start, s.end),
    at = s.start + body.trimEnd().length;
  return description.slice(0, at) + nl + line + description.slice(at);
}
export function appendDescription(description: string, value: string) {
  if (/^\s*#{1,6}\s/m.test(value)) throw new WorkFault("AI_PATCH_INVALID", 409);
  return description + (description ? "\n\n" : "") + value;
}
