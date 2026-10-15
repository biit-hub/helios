import { it, expect } from "vitest";
import {
  patchDocument,
  readGoal,
  descriptionLinks,
  safeDocumentUrl,
} from "../../packages/backend/src/tasks/document";
import { readChecklist } from "../../packages/backend/src/ai/checklist";
import { validateOutput } from "../../packages/backend/src/ai/validation";
import { outputSchema } from "../../packages/backend/src/ai/prompt";
import type { AiOutput } from "@helios/contracts";
const output = (extra: Partial<AiOutput> = {}): AiOutput => ({
  clarity: "uncertain",
  feasibility: "uncertain",
  missing: [],
  reason: "Bekannte Fakten prüfen",
  nextStep: null,
  estimatedMinutes: null,
  uncertainty: "Akzeptanz unbekannt",
  patches: [],
  ...extra,
});
const assessment = () =>
  ["S", "M", "A", "R", "T"].map((c) => ({
    component: c as "S" | "M" | "A" | "R" | "T",
    status: "missing" as const,
    assessment: "Noch nicht belegt",
    evidence: null,
    question: "Was ist hierzu bekannt?",
  }));
it("changes only the AST goal section and preserves notes, links and CRLF bytes", () => {
  const text =
    "Vorwort **behalten**\r\n\r\n## Ziel\r\nAltes Ziel\r\n\r\n## Notizen\r\n[Quelle](https://example.com/a)\r\n";
  const after = patchDocument(text, {
    kind: "goal",
    value: "Konkretes Ergebnis",
  });
  expect(after).toBe(text.replace("Altes Ziel", "Konkretes Ergebnis"));
  expect(readGoal(after)).toBe("Konkretes Ergebnis");
});
it("ignores code-fenced headings and appends a readable goal", () => {
  const text = "~~~md\n## Ziel\nBeispiel\n~~~\n";
  expect(readGoal(text)).toBe("");
  expect(patchDocument(text, { kind: "goal", value: "Wirkliches Ziel" })).toBe(
    text + "\n\n## Ziel\nWirkliches Ziel",
  );
});
it.each(["## Ziel\nA\n## Ziel\nB", "## **Ziel**\nA"])(
  "rejects ambiguous goal headings: %s",
  (text) => expect(() => readGoal(text)).toThrow(),
);
it("rejects injected headings in goal edits", () =>
  expect(() =>
    patchDocument("", { kind: "goal", value: "Text\n## Notizen\nErsetzen" }),
  ).toThrow());
it("roundtrips checklist edit, toggle, reopen, sort, delete and add preserving neighbours", () => {
  let text =
    "Intro\n\n## Checkliste\n- [ ] A\n- [x] B\n\n## Ziel\nZiel behalten\n";
  text = patchDocument(text, {
    kind: "checklist",
    items: [
      { text: "B", checked: false },
      { text: "A korrigiert", checked: true },
      { text: "C", checked: false },
    ],
  });
  expect(
    readChecklist(text).map((p) => ({ text: p.text, checked: p.checked })),
  ).toEqual([
    { text: "B", checked: false },
    { text: "A korrigiert", checked: true },
    { text: "C", checked: false },
  ]);
  text = patchDocument(text, { kind: "checklist", items: [] });
  expect(readChecklist(text)).toEqual([]);
  expect(text.endsWith("## Ziel\nZiel behalten\n")).toBe(true);
});
it.each([
  "## Checkliste\n- [ ] A\n  - [ ] Kind",
  "## Checkliste\nNotizen erhalten",
  "## Checkliste\n- [ ] A\n- [ ] A",
])("rejects ambiguous checklist: %s", (text) =>
  expect(() => patchDocument(text, { kind: "checklist", items: [] })).toThrow(),
);
it("preserves escaped Markdown and safe links when editing one link", () => {
  const source =
    "Notiz **bewahren**\n[Alt](https://example.com/old)\n[Andere](https://example.org/a)";
  const changed = patchDocument(source, {
    kind: "link-edit",
    target: "https://example.com/old",
    url: "obsidian://open?vault=Test&file=Plan",
    label: "Plan [neu]",
  });
  expect(changed).toContain("Notiz **bewahren**");
  expect(changed).toContain("[Andere](https://example.org/a)");
  expect(descriptionLinks(changed)[0]?.label).toBe("Plan [neu]");
});
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "file:///etc/passwd",
  "https://user:secret@example.com/",
  "https://example.com/\nscript",
])("rejects dangerous URL %s", (url) => {
  expect(safeDocumentUrl(url)).toBe(false);
  expect(() =>
    patchDocument("", { kind: "link-add", url, label: "Test" }),
  ).toThrow();
});
it("shows reference links without fetching and rejects ambiguous editing", () => {
  expect(
    descriptionLinks("[Dokument][a]\n\n[a]: https://example.com/a"),
  ).toEqual([{ url: "https://example.com/a", label: "Dokument" }]);
  expect(() =>
    patchDocument("[A](https://example.com) [B](https://example.com)", {
      kind: "link-edit",
      target: "https://example.com",
      url: "https://example.org",
      label: "Neu",
    }),
  ).toThrow();
});
it("accepts SMART questions for missing facts without manufacturing a deadline", () => {
  const o = output({ smart: assessment() });
  expect(validateOutput("smart", "Ergebnis offen", null, o)).toEqual(o);
});
it("rejects duplicate SMART components and invented numeric deadlines", () => {
  const smart = assessment();
  smart[4] = smart[0]!;
  expect(() =>
    validateOutput("smart", "Bekannt", null, output({ smart })),
  ).toThrow();
  const proposed = output({
    smart: assessment(),
    patches: [
      {
        kind: "goal",
        value: "Bis 2032-01-01 fertig",
        target: null,
        evidence: "Bekannt",
        reason: "Verbesserung",
      },
    ],
  });
  expect(() => validateOutput("smart", "Bekannt", null, proposed)).toThrow();
});
it("produces JSON schemas for all structured E8 output kinds", () => {
  for (const kind of ["smart", "epic", "decomposition"] as const)
    expect(outputSchema(kind)).toHaveProperty("properties");
});

it.each(["A", "R", "T"] as const)(
  "rejects SMART %s marked known from the goal alone",
  (component) => {
    const smart = assessment();
    const i = smart.findIndex((s) => s.component === component);
    smart[i] = {
      ...smart[i]!,
      status: "known" as never,
      evidence: "Handbuch veröffentlichen" as never,
      question: null as never,
    };
    expect(() =>
      validateOutput(
        "smart",
        "Handbuch veröffentlichen",
        null,
        output({ smart }),
      ),
    ).toThrow();
  },
);
