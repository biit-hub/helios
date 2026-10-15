import { it, expect } from "vitest";
import {
  patchChecklist,
  readChecklist,
} from "../../packages/backend/src/ai/checklist";
import { aiConfig } from "../../packages/backend/src/ai/config";
import { createOllama } from "../../packages/backend/src/ai/ollama";
import {
  validateOutput,
  needsContext,
} from "../../packages/backend/src/ai/validation";
import { aiOutput } from "@helios/contracts";
const output = {
  clarity: "clear" as const,
  feasibility: "executable" as const,
  missing: [],
  reason: "Klar",
  nextStep: null,
  estimatedMinutes: null,
  uncertainty: "Geschätzt",
  patches: [],
};
it("patches exactly one Markdown checkbox and preserves all foreign bytes including CRLF", () => {
  const text =
    "# Ziel\r\nText **unverändert**\r\n\r\n## Checkliste\r\n- [ ] Quellen sammeln\r\n- [x] Erster Schritt\r\n\r\n## Helios – Wartedetails\r\nOriginal\r\n";
  const done = patchChecklist(
    text,
    "check-complete",
    "Quellen sammeln",
    "Quellen sammeln",
  );
  expect(done).toBe(
    text.replace("- [ ] Quellen sammeln", "- [x] Quellen sammeln"),
  );
  const added = patchChecklist(text, "check-add", "Folien schreiben", null);
  expect(added).toContain(
    "- [ ] Folien schreiben\r\n\r\n## Helios – Wartedetails\r\nOriginal\r\n",
  );
  expect(readChecklist(added)).toHaveLength(3);
});
it.each([
  "## Checkliste\n- [ ] Doppelt\n- [ ] Doppelt",
  "## Checkliste\nText statt Liste",
  "## Checkliste\n- [ ] Gut\n## Checkliste\n- [ ] Zweite Liste",
  "## Checkliste\n  - [ ] Verschachtelt",
])("rejects ambiguous checklist without rewriting it: %s", (text) =>
  expect(() => patchChecklist(text, "check-add", "Neu", null)).toThrow(),
);
it("adds a checklist without changing existing Markdown", () =>
  expect(patchChecklist("## Ziel\nUnverändert", "check-add", "Neu", null)).toBe(
    "## Ziel\nUnverändert\n\n## Checkliste\n- [ ] Neu",
  ));
it.each([
  "https://ollama.com/",
  "http://8.8.8.8:11434/",
  "http://user:pass@192.168.1.2:11434/",
  "http://192.168.1.2:11434/path",
])("refuses nonlocal or credentialed Ollama endpoint %s", (base) =>
  expect(() =>
    aiConfig({ OLLAMA_BASE_URL: base, OLLAMA_MODEL: "synthetic" }),
  ).toThrow(),
);
it("accepts distributed private LAN endpoint and disabled configuration", () => {
  expect(
    aiConfig({
      OLLAMA_BASE_URL: "http://192.168.1.2:11434",
      OLLAMA_MODEL: "synthetic",
    }).enabled,
  ).toBe(true);
  expect(aiConfig({}).enabled).toBe(false);
});
it("passes JSON-schema to chat with no tools and blocks redirects", async () => {
  let options: RequestInit | undefined;
  const generate = createOllama(
    {
      enabled: true,
      base: "http://127.0.0.1:11434",
      model: "synthetic",
      timeout: 1000,
    },
    async (_url, init) => {
      if (String(_url).endsWith("/api/tags"))
        return Response.json({
          models: [{ name: "synthetic", digest: "a".repeat(64), size: 1000 }],
        });
      if (String(_url).endsWith("/api/show"))
        return Response.json({
          details: { format: "gguf" },
          capabilities: ["completion"],
        });
      options = init;
      return Response.json({
        done: true,
        message: { content: JSON.stringify(output) },
      });
    },
  );
  expect(
    await generate("analysis", { originalInput: "synthetic" }),
  ).toMatchObject(output);
  expect(options?.redirect).toBe("error");
  const body = JSON.parse(String(options?.body));
  expect(body.format.type).toBe("object");
  expect(body.tools).toBeUndefined();
  expect(body.stream).toBe(false);
});
it.each([
  "not json",
  JSON.stringify({ done: true, message: { content: "{broken" } }),
  JSON.stringify({
    done: true,
    message: {
      content: JSON.stringify({
        ...output,
        patches: [{ kind: "close", value: "all" }],
      }),
    },
  }),
])("rejects malformed model output", async (text) => {
  const generate = createOllama(
    {
      enabled: true,
      base: "http://127.0.0.1:11434",
      model: "synthetic",
      timeout: 1000,
    },
    async (url) =>
      String(url).endsWith("/api/tags")
        ? Response.json({
            models: [{ name: "synthetic", digest: "a".repeat(64), size: 1000 }],
          })
        : String(url).endsWith("/api/show")
          ? Response.json({
              details: { format: "gguf" },
              capabilities: ["completion"],
            })
          : new Response(text),
  );
  await expect(generate("analysis", {})).rejects.toMatchObject({
    code: "AI_INVALID_OUTPUT",
  });
});
it("distinguishes unavailable model and abort from valid empty output", async () => {
  const profile = {
    enabled: true,
    base: "http://127.0.0.1:11434",
    model: "synthetic",
    timeout: 1000,
  };
  await expect(
    createOllama(profile, async () => new Response("", { status: 404 }))(
      "capture",
      {},
    ),
  ).rejects.toMatchObject({ code: "AI_MODEL_MISSING" });
  const controller = new AbortController();
  controller.abort();
  await expect(
    createOllama(profile, async () => {
      throw Error("aborted");
    })("capture", {}, controller.signal),
  ).rejects.toMatchObject({ code: "AI_CANCELLED" });
});
it("rejects unsupported actions, fabricated evidence and absent date evidence", () => {
  const base = {
    ...output,
    patches: [
      {
        kind: "deadline",
        value: "2026-10-20",
        target: null,
        evidence: "nächste Woche",
        reason: "Synthetic",
      },
    ],
  };
  expect(() =>
    validateOutput("capture", "nächste Woche", null, aiOutput.parse(base)),
  ).toThrow();
  expect(() =>
    validateOutput(
      "analysis",
      "synthetic",
      null,
      aiOutput.parse({
        ...output,
        patches: [
          {
            kind: "comment",
            value: "Write",
            target: null,
            evidence: "invented",
            reason: "Synthetic",
          },
        ],
      }),
    ),
  ).toThrow();
});

it("refuses remote-model metadata before any task data reaches chat", async () => {
  let chats = 0;
  const generate = createOllama(
    {
      enabled: true,
      base: "http://127.0.0.1:11434",
      model: "synthetic",
      timeout: 1000,
    },
    async (url) => {
      if (String(url).endsWith("/api/chat")) chats++;
      return Response.json({
        remote_host: "https://example.invalid",
        remote_model: "cloud-alias",
        details: { format: "gguf" },
        capabilities: ["completion"],
      });
    },
  );
  await expect(
    generate("analysis", { privateTask: "never sent" }),
  ).rejects.toMatchObject({ code: "AI_LOCAL_MODEL_REQUIRED" });
  expect(chats).toBe(0);
});

it("preserves exact checkbox position with mixed line endings and rejects formatted ambiguous headings", () => {
  const text =
    "# Ziel\nText\r\n\r\n## Checkliste\n- [ ] Eins\r\n- [ ] Zwei\n\n## Notizen\r\nFremd";
  expect(patchChecklist(text, "check-complete", "Zwei", "Zwei")).toBe(
    text.replace("- [ ] Zwei", "- [x] Zwei"),
  );
  expect(() =>
    patchChecklist("## **Checkliste**\n- [ ] Eins", "check-add", "Zwei", null),
  ).toThrow();
});

it("grounds natural dates in the original local day and keeps deadlines separate", async () => {
  const { referenceDay, dateIsGrounded } =
    await import("../../packages/backend/src/ai/dates");
  expect(referenceDay(new Date("2026-10-14T22:30:00Z"), "Europe/Zurich")).toBe(
    "2026-10-15",
  );
  expect(
    dateIsGrounded("due", "2026-10-16", "morgen vorbereiten", "2026-10-15"),
  ).toBe(true);
  expect(
    dateIsGrounded("deadline", "2026-10-17", "Abgabe übermorgen", "2026-10-15"),
  ).toBe(true);
  expect(
    dateIsGrounded(
      "deadline",
      "2026-10-16",
      "morgen vorbereiten",
      "2026-10-15",
    ),
  ).toBe(false);
  expect(
    dateIsGrounded("due", "2026-10-19", "nächste Woche", "2026-10-15"),
  ).toBe(false);
  expect(
    dateIsGrounded("due", "2026-10-16", "nicht morgen", "2026-10-15"),
  ).toBe(false);
  expect(
    dateIsGrounded("due", "2026-10-16", "morgen um 9 Uhr", "2026-10-15"),
  ).toBe(false);
  expect(
    dateIsGrounded(
      "due",
      "2026-10-22",
      "Am 22.10.2026 vorbereiten",
      "2026-10-15",
    ),
  ).toBe(true);
});

it("rejects serialized null as fabricated evidence", () => {
  expect(() =>
    validateOutput("capture", "Router neu starten", null, {
      ...output,
      patches: [
        {
          kind: "title",
          value: "Router neu starten",
          target: null,
          evidence: "null",
          reason: "Synthetic",
        },
      ],
    }),
  ).toThrow();
});
it.each([
  "Die Beschreibung fehlt.",
  "Fehlendes Datum",
  "Keine Projektzuordnung",
  "Das Datum ist nicht gesetzt.",
])("never sets need_context solely for optional metadata: %s", (reason) => {
  expect(
    needsContext(
      {
        ...output,
        clarity: "needs_context",
        reason,
        missing: ["Bitte ergänzen"],
      },
      false,
    ),
  ).toBe(false);
});
it("permits a concrete clarification reason and respects explicit clarity", () => {
  const proposal = {
    ...output,
    clarity: "needs_context" as const,
    reason: "Thema?",
    missing: ["Was soll mit Eva geklärt werden?"],
  };
  expect(needsContext(proposal, false)).toBe(true);
  expect(needsContext(proposal, true)).toBe(false);
});
