import { fromMarkdown } from "mdast-util-from-markdown";
import type { DocumentChange } from "@helios/contracts";
import { WorkFault } from "../work/service";
import { markdownSection } from "./markdown-section";
import { readChecklist } from "../ai/checklist";
import { patchLink } from "./document-links";
export { safeDocumentUrl, descriptionLinks } from "./document-links";
export function readGoal(text: string) {
  const s = markdownSection(text, "Ziel");
  return s ? text.slice(s.start, s.end).trim() : "";
}
function replaceBody(text: string, name: string, value: string) {
  const s = markdownSection(text, name),
    nl = text.includes("\r\n") ? "\r\n" : "\n";
  if (!s) return text + (text ? nl + nl : "") + "## " + name + nl + value;
  const body = text.slice(s.start, s.end),
    leading = body.slice(0, body.length - body.trimStart().length),
    trailing = body.slice(body.trimEnd().length);
  const before = leading || nl,
    after = trailing || (s.end < text.length ? nl + nl : "");
  return text.slice(0, s.start) + before + value + after + text.slice(s.end);
}
function patchGoal(
  text: string,
  change: Extract<DocumentChange, { kind: "goal" }>,
) {
  if (
    fromMarkdown(change.value).children.some(
      (n) => n.type === "heading" && n.depth <= 2,
    )
  )
    throw new WorkFault("MARKDOWN_AMBIGUOUS", 409);
  return replaceBody(text, "Ziel", change.value.trim());
}
function replaceChecklist(
  text: string,
  change: Extract<DocumentChange, { kind: "checklist" }>,
) {
  const existing = readChecklist(text);
  if (
    new Set(change.items.map((p) => p.text)).size !== change.items.length ||
    change.items.some((p) => /[\r\n]/.test(p.text))
  )
    throw new WorkFault("CHECKLIST_AMBIGUOUS", 409);
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  return replaceBody(
    text,
    "Checkliste",
    change.items
      .map((p) => {
        const old = existing.find((x) => x.text === p.text);
        if (!old) return "- [" + (p.checked ? "x" : " ") + "] " + p.text;
        const end = text.indexOf("\n", old.start),
          line = text
            .slice(old.start, end < 0 ? text.length : end)
            .replace(/\r$/, ""),
          at = old.marker - old.start;
        return (
          line.slice(0, at) +
          checkboxMarker(p.checked, old.checked, line[at]!) +
          line.slice(at + 1)
        );
      })
      .join(nl),
  );
}
function checkboxMarker(
  checked: boolean,
  wasChecked: boolean,
  original: string,
) {
  if (!checked) return " ";
  if (wasChecked) return original;
  return "x";
}
export function patchDocument(text: string, change: DocumentChange) {
  let out: string;
  if (change.kind === "goal") out = patchGoal(text, change);
  else if (change.kind === "checklist") out = replaceChecklist(text, change);
  else out = patchLink(text, change);
  if (out.length > 12000) throw new WorkFault("INVALID_REQUEST");
  return out;
}
