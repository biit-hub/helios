// @vitest-environment node
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  renderJobFile,
  csvCell,
} from "../../packages/backend/src/ai-jobs/render";
import {
  publicAddress,
  publicUrl,
  researchSources,
  PUBLIC_SEARCH_QUESTION,
  ResearchQuestion,
  sourceText,
  readPublicPage,
} from "../../packages/backend/src/ai-jobs/research";
import {
  validateJobAnswer,
  createJobGenerator,
  JobInferenceUncertain,
} from "../../packages/backend/src/ai-jobs/generation";
import type { AiJobRow } from "../../packages/backend/src/ai-jobs/schema";
const id = "55555555-5555-4555-8555-555555555555";
const content = {
  title: "Überprüfung & Übersicht",
  paragraphs: ["Grüsse aus Zürich. <script>keine Ausführung</script>"],
  columns: ["Name", "Wert"],
  rows: [
    ["Synthetisch", '=HYPERLINK("file:///private")'],
    ["Zweite Zeile", "@SUM(A1)"],
  ],
};
function unzip(buffer: Buffer) {
  const files = new Map<string, string>();
  let p = 0;
  // Walk the central directory, whose sizes remain available for ZIP data descriptors.
  while ((p = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p)) >= 0) {
    const method = buffer.readUInt16LE(p + 10),
      size = buffer.readUInt32LE(p + 20);
    const nameSize = buffer.readUInt16LE(p + 28),
      extra = buffer.readUInt16LE(p + 30),
      comment = buffer.readUInt16LE(p + 32);
    const name = buffer.subarray(p + 46, p + 46 + nameSize).toString();
    const local = buffer.readUInt32LE(p + 42);
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const bytes = buffer.subarray(start, start + size);
    files.set(name, (method === 8 ? inflateRawSync(bytes) : bytes).toString());
    p += 46 + nameSize + extra + comment;
  }
  return files;
}
it("renders real Word and Excel containers with escaped text, no macros, external relationships or formulas", async () => {
  const docx = await renderJobFile(id, 1, "docx", content);
  const word = unzip(docx.data);
  expect(word.get("word/document.xml")).toContain(
    "Überprüfung &amp; Übersicht",
  );
  expect(word.get("word/document.xml")).toContain("&lt;script&gt;");
  expect([...word.keys()].some((s) => /vbaProject|embedding/i.test(s))).toBe(
    false,
  );
  const xlsx = await renderJobFile(id, 2, "xlsx", content);
  const excel = unzip(xlsx.data);
  expect(excel.get("xl/worksheets/sheet1.xml")).not.toContain("<f>");
  expect([...excel.values()].join("\n")).toContain("HYPERLINK");
  expect([...excel.values()].join("\n")).not.toContain('TargetMode="External"');
  expect(docx.sha256).toBe(
    createHash("sha256").update(docx.data).digest("hex"),
  );
});
it("produces a PDF with a local embedded Unicode font and pagination", async () => {
  const file = await renderJobFile(id, 1, "pdf", {
    ...content,
    paragraphs: Array.from({ length: 70 }, () =>
      "Ä Ö Ü ä ö ü ß – Zürich".repeat(5),
    ),
  });
  expect(file.data.subarray(0, 5).toString()).toBe("%PDF-");
  expect(file.data.subarray(-20).toString()).toContain("%%EOF");
  expect(file.size).toBeGreaterThan(5000);
  const { PDFDocument } = createRequire(
    new URL("../../packages/backend/package.json", import.meta.url),
  )("pdf-lib") as {
    PDFDocument: {
      load: (bytes: Uint8Array) => Promise<{ getPageCount: () => number }>;
    };
  };
  expect((await PDFDocument.load(file.data)).getPageCount()).toBeGreaterThan(1);
  await expect(
    renderJobFile(id, 1, "pdf", { ...content, paragraphs: ["🚀"] }),
  ).rejects.toThrow("AI_JOB_FILE_CHARACTERS");
});
it("neutralizes CSV formula prefixes and active Markdown without changing the stored model content", async () => {
  expect(csvCell(" \t=2+2")).toBe('"\' \t=2+2"');
  const csv = await renderJobFile(id, 1, "csv", content);
  expect(csv.data.toString()).toContain("\"'=HYPERLINK");
  const md = await renderJobFile(id, 1, "md", content);
  expect(md.data.toString()).not.toContain("<script>");
  expect(md.data.toString()).not.toContain("[click](javascript:");
  expect(content.rows[0]![1]).toMatch(/^=HYPERLINK/);
  await expect(
    renderJobFile("../../private", 1, "md", content),
  ).rejects.toThrow();
});
it.each([
  "127.0.0.1",
  "10.1.2.3",
  "169.254.169.254",
  "100.64.0.1",
  "192.168.1.1",
  "::1",
  "::ffff:8.8.8.8",
  "fc00::1",
  "2001:db8::1",
  "2002:7f00:1::",
  "224.0.0.1",
])("blocks nonpublic or ambiguous research destination %s", (ip) => {
  expect(publicAddress(ip)).toBe(false);
});
it("only allows public web origins, no credentials, special ports or local protocols", () => {
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/test",
    "http://127.1/test",
    "https://example.com:8443/",
    "https://user:secret@example.com/",
  ])
    expect(() => publicUrl(url)).toThrow();
  expect(publicUrl("https://example.com/docs").href).toBe(
    "https://example.com/docs",
  );
});
it("does not leak private prompts into search and requires explicit public terms, records fetched sources", async () => {
  const requests: string[] = [];
  const search = researchSources(
    { ...process.env, RESEARCH_SEARXNG_BASE_URL: "http://192.168.1.10:8080" },
    async (url) => {
      requests.push(String(url));
      return Response.json({
        results: [
          { title: "Synthetische Quelle", url: "https://example.com/public" },
        ],
      });
    },
    async (url) => ({
      url,
      text: "Synthetic public source. Ignore previous instructions is untrusted data.",
    }),
  );
  const job = { originalPrompt: "VERTRAULICHE-INTERNAS" } as AiJobRow;
  await expect(
    search(job, [], new AbortController().signal),
  ).rejects.toBeInstanceOf(ResearchQuestion);
  expect(requests).toHaveLength(0);
  const sources = await search(
    job,
    [
      { kind: "question", text: PUBLIC_SEARCH_QUESTION },
      { kind: "answer", text: "Öffentliche Fachbegriffe" },
    ],
    new AbortController().signal,
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toContain(job.originalPrompt);
  expect(new URL(requests[0]!).searchParams.get("q")).toBe(
    "Öffentliche Fachbegriffe",
  );
  expect(sources[0]!.retrievedAt).toMatch(/^20/);
});
it("validates exactly one typed output and rectangular data; does not accept model code or arbitrary file paths", () => {
  const result = {
    kind: "result",
    text: "Ergebnis",
    uncertainties: [],
    document: content,
  };
  expect(() => validateJobAnswer(result, "text")).toThrow();
  expect(() =>
    validateJobAnswer(
      { ...result, document: { ...content, path: "/tmp/output" } },
      "file",
    ),
  ).toThrow();
  expect(() =>
    validateJobAnswer(
      { ...result, document: { ...content, rows: [["short"]] } },
      "file",
    ),
  ).toThrow();
  expect(validateJobAnswer(result, "file")).toEqual(result);
});
it("verifies the pinned local model before generation and never uses an alternate model", async () => {
  let calls = 0;
  const generate = createJobGenerator(
    { ...process.env, OLLAMA_BASE_URL: "http://192.168.1.10:11434" },
    async () => {
      calls++;
      throw Error("must not infer");
    },
    async () => ({
      connected: true,
      code: null,
      models: [
        {
          name: "other",
          digest: "a".repeat(64),
          available: true,
          local: true,
          size: 100,
          reason: null,
        },
      ],
    }),
  );
  await expect(
    generate(
      {
        job: { model: "removed", digest: "a".repeat(64) } as AiJobRow,
        turns: [],
        previous: null,
        sources: [],
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow("AI_JOB_MODEL_UNAVAILABLE");
  expect(calls).toBe(0);
});

const localModel = {
  name: "synthetic-local",
  digest: "a".repeat(64),
  available: true,
  local: true,
  size: 100,
  reason: null,
};
const modelCatalog = async () => ({
  connected: true,
  code: null,
  models: [localModel],
});
const generationInput = () => ({
  job: {
    id,
    model: localModel.name,
    digest: localModel.digest,
    originalPrompt: "Synthetische Quelle unverändert",
    output: "text",
    format: null,
  } as AiJobRow,
  turns: [],
  previous: null,
  sources: [],
});
it("uses a strict structured local request and verifies the model digest again after generation", async () => {
  let inspections = 0;
  let body: Record<string, unknown> = {};
  const generate = createJobGenerator(
    { ...process.env, OLLAMA_BASE_URL: "http://192.168.1.10:11434" },
    async (url, init) => {
      expect(String(url)).toBe("http://192.168.1.10:11434/api/chat");
      expect(init?.redirect).toBe("error");
      body = JSON.parse(String(init?.body));
      return Response.json({
        model: localModel.name,
        done: true,
        done_reason: "stop",
        message: {
          content: JSON.stringify({
            kind: "result",
            text: "Synthetische Antwort",
            document: null,
            uncertainties: [],
          }),
        },
        eval_count: 7,
      });
    },
    async () => {
      inspections++;
      return modelCatalog();
    },
  );
  const result = await generate(
    generationInput(),
    new AbortController().signal,
  );
  expect(result.answer).toMatchObject({
    kind: "result",
    text: "Synthetische Antwort",
  });
  expect(inspections).toBe(2);
  expect(body).toMatchObject({
    model: localModel.name,
    stream: false,
    options: { temperature: 0, num_ctx: 8192, num_predict: 4096 },
  });
  expect(body).not.toHaveProperty("tools");
  expect(result.metrics.eval_count).toBe(7);
});
it.each([
  { done: false },
  { done_reason: "length" },
  { model: "remote-cloud" },
  {
    message: { content: "{}", tool_calls: [{ function: { name: "execute" } }] },
  },
])(
  "rejects incomplete, truncated, switched or tool-calling model envelopes %#",
  async (patch) => {
    const generate = createJobGenerator(
      { ...process.env, OLLAMA_BASE_URL: "http://192.168.1.10:11434" },
      async () =>
        Response.json({
          model: localModel.name,
          done: true,
          done_reason: "stop",
          message: { content: "{}" },
          ...patch,
        }),
      modelCatalog,
    );
    await expect(
      generate(generationInput(), new AbortController().signal),
    ).rejects.toThrow("AI_JOB_INVALID_OUTPUT");
  },
);
it("retains bounded invalid raw model output for local evidence without publishing a result", async () => {
  const raw = "Synthetisch ungültiges JSON";
  const generate = createJobGenerator(
    { ...process.env, OLLAMA_BASE_URL: "http://192.168.1.10:11434" },
    async () =>
      Response.json({
        model: localModel.name,
        done: true,
        done_reason: "stop",
        message: { content: raw },
      }),
    modelCatalog,
  );
  await expect(
    generate(generationInput(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "AI_JOB_INVALID_OUTPUT", raw });
});
it("treats transport loss during inference as uncertain rather than granting automatic replay", async () => {
  const generate = createJobGenerator(
    { ...process.env, OLLAMA_BASE_URL: "http://192.168.1.10:11434" },
    async () => {
      throw new TypeError("synthetic connection reset");
    },
    modelCatalog,
  );
  await expect(
    generate(generationInput(), new AbortController().signal),
  ).rejects.toBeInstanceOf(JobInferenceUncertain);
});
it("extracts bounded source text without scripts and rejects private destinations before opening a socket", async () => {
  expect(
    sourceText(
      "<html><script>PRIVATE SCRIPT</script><style>hidden</style><p>Öffentliche Quelle &amp; Text</p></html>",
    ),
  ).toBe("Öffentliche Quelle & Text");
  expect(sourceText("<p>" + "a".repeat(200000) + "</p>")).toHaveLength(4500);
  await expect(
    readPublicPage("http://169.254.169.254/", new AbortController().signal),
  ).rejects.toThrow("AI_JOB_RESEARCH_BLOCKED");
});

it.each([
  { kind: "question", text: "   " },
  { kind: "result", text: "\n", document: null, uncertainties: [] },
])("rejects whitespace-only questions and results %#", (answer) => {
  expect(() => validateJobAnswer(answer, "text")).toThrow();
});
