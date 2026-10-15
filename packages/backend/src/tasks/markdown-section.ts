import { fromMarkdown } from "mdast-util-from-markdown";
import { WorkFault } from "../work/service";
export function nodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const n = value as { value?: string; children?: unknown[] };
  return n.value ?? n.children?.map(nodeText).join("") ?? "";
}
export function markdownSection(text: string, name: string) {
  const nodes = fromMarkdown(text).children;
  const headings = nodes
    .map((n, index) => ({ n, index }))
    .filter(
      ({ n }) => n.type === "heading" && n.depth === 2 && nodeText(n) === name,
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
    throw new WorkFault(
      name === "Checkliste" ? "CHECKLIST_AMBIGUOUS" : "MARKDOWN_AMBIGUOUS",
      409,
    );
  if (headings.length > 1) throw new WorkFault("MARKDOWN_AMBIGUOUS", 409);
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
