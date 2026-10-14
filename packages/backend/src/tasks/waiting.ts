import { fromMarkdown } from "mdast-util-from-markdown";
import type { WaitingDetails } from "@helios/contracts";
import { waitingInput } from "@helios/contracts";
import { WorkFault } from "../work/service";
const title = "Helios – Wartedetails";
function span(description: string) {
  const nodes = fromMarkdown(description).children;
  const matches = nodes
    .map((n, index) => ({ n, index }))
    .filter(
      ({ n }) =>
        n.type === "heading" &&
        n.depth === 2 &&
        n.children.length === 1 &&
        n.children[0]!.type === "text" &&
        n.children[0]!.value === title,
    );
  if (matches.length > 1) throw new WorkFault("WAITING_AMBIGUOUS", 409);
  if (!matches.length) return null;
  const { n, index } = matches[0]!;
  let end = n.position!.end.offset!;
  for (const child of nodes.slice(index + 1)) {
    if (child.type === "heading" && child.depth <= 2) break;
    end = child.position!.end.offset!;
  }
  return {
    start: n.position!.start.offset!,
    headingEnd: n.position!.end.offset!,
    end,
  };
}
export function readWaiting(description: string): WaitingDetails | null {
  const s = span(description);
  if (!s) return null;
  const lines = description.slice(s.headingEnd, s.end).trim().split(/\r?\n/);
  if (
    lines.length !== 3 ||
    !lines[0]?.startsWith("Wartet auf: ") ||
    !lines[1]?.startsWith("Gegenstand: ") ||
    !lines[2]?.startsWith("Nachfassen am: ")
  )
    throw new WorkFault("WAITING_AMBIGUOUS", 409);
  const v = waitingInput.safeParse({
    who: lines[0].slice(12),
    subject: lines[1].slice(12),
    followUp: lines[2].slice(15) === "—" ? null : lines[2].slice(15),
  });
  if (!v.success) throw new WorkFault("WAITING_AMBIGUOUS", 409);
  return v.data;
}
export function patchWaiting(description: string, details: WaitingDetails) {
  const d = waitingInput.parse(details);
  if (/[\r\n]/.test(d.who + d.subject)) throw new WorkFault("INVALID_REQUEST");
  const block = `## ${title}\nWartet auf: ${d.who}\nGegenstand: ${d.subject}\nNachfassen am: ${d.followUp ?? "—"}`;
  const s = span(description);
  if (!s)
    return (
      description +
      (description ? (description.endsWith("\n\n") ? "" : "\n\n") : "") +
      block
    );
  readWaiting(description);
  return description.slice(0, s.start) + block + description.slice(s.end);
}
