import { expect, it, vi } from "vitest";
import { aiJobCreate } from "@helios/contracts";
import {
  createModelDiscovery,
  selectedModel,
} from "../../packages/backend/src/ai-jobs/models";
const local = {
  name: "synthetic-local:latest",
  digest: "a".repeat(64),
  size: 1234,
};
const env = { OLLAMA_BASE_URL: "http://192.168.1.2:11434" };
it("discovers bounded local text models without a legacy model setting or inference", async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.redirect).toBe("error");
    if (String(url).endsWith("/api/tags"))
      return Response.json({ models: [local] });
    expect(String(url)).toBe(env.OLLAMA_BASE_URL + "/api/show");
    expect(JSON.parse(String(init?.body))).toEqual({ model: local.name });
    return Response.json({
      details: { format: "gguf" },
      capabilities: ["completion"],
    });
  });
  const result = await createModelDiscovery(env, fetcher)();
  expect(result).toEqual({
    connected: true,
    code: null,
    models: [{ ...local, local: true, available: true, reason: null }],
  });
  expect(selectedModel(result, local.name).digest).toBe(local.digest);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  {
    remote_host: "https://cloud.invalid",
    details: { format: "gguf" },
    capabilities: ["completion"],
  },
  {
    remote_model: "external",
    details: { format: "gguf" },
    capabilities: ["completion"],
  },
  { details: { format: "gguf" }, capabilities: ["embedding"] },
  { details: { format: "other" }, capabilities: ["completion"] },
  { capabilities: ["completion"] },
])("keeps non-local or unsuitable models unavailable: %j", async (metadata) => {
  const fetcher: typeof fetch = async (url) =>
    Response.json(
      String(url).endsWith("/api/tags") ? { models: [local] } : metadata,
    );
  const result = await createModelDiscovery(env, fetcher)();
  expect(result.models[0]?.available).toBe(false);
  expect(() => selectedModel(result, local.name)).toThrow(
    "AI_JOB_MODEL_UNAVAILABLE",
  );
});
it.each([
  { models: Array.from({ length: 33 }, () => local) },
  { models: [local, local] },
  { models: [{ ...local, digest: "bad" }] },
  { models: [{ ...local, size: -1 }] },
])("rejects incomplete, ambiguous or excessive catalogs", async (body) => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
  expect((await createModelDiscovery(env, fetcher)()).connected).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("bounds response bytes and fails closed on disconnect", async () => {
  const tooLarge: typeof fetch = async () => new Response(" ".repeat(65537));
  expect((await createModelDiscovery(env, tooLarge)()).connected).toBe(false);
  expect(
    (
      await createModelDiscovery(env, async () => {
        throw new Error("offline");
      })()
    ).connected,
  ).toBe(false);
});
it("never calls unconfigured or public origins", async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect((await createModelDiscovery({}, fetcher)()).models).toEqual([]);
  expect(() =>
    createModelDiscovery({ OLLAMA_BASE_URL: "https://example.com" }, fetcher),
  ).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("never selects a missing model or an alternate installed model", () => {
  expect(() =>
    selectedModel(
      {
        connected: true,
        code: null,
        models: [{ ...local, local: true, available: true, reason: null }],
      },
      "missing",
    ),
  ).toThrow();
});
it("requires one output and exactly one format only for files", () => {
  const input = {
    key: crypto.randomUUID(),
    prompt: "Synthetic",
    output: "text",
  };
  expect(aiJobCreate.parse(input).origin).toBeNull();
  expect(aiJobCreate.safeParse({ ...input, output: "file" }).success).toBe(
    false,
  );
  expect(aiJobCreate.safeParse({ ...input, format: "pdf" }).success).toBe(
    false,
  );
  expect(
    aiJobCreate.safeParse({ ...input, output: "file", format: "pdf" }).success,
  ).toBe(true);
  expect(
    aiJobCreate.safeParse({ ...input, output: ["text", "file"] }).success,
  ).toBe(false);
  expect(
    aiJobCreate.safeParse({ ...input, model: "client-selected" }).success,
  ).toBe(false);
});
it("preserves original prompt whitespace while rejecting blank prompts", () => {
  const input = {
    key: crypto.randomUUID(),
    output: "text",
    prompt: "  Zeile eins\n\n  eingerückt  ",
  };
  expect(aiJobCreate.parse(input).prompt).toBe(input.prompt);
  expect(aiJobCreate.safeParse({ ...input, prompt: " \n\t " }).success).toBe(
    false,
  );
});
it("coalesces simultaneous catalog reads but refreshes again after completion", async () => {
  let release!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/api/tags")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json({
          details: { format: "gguf" },
          capabilities: ["completion"],
        }),
  );
  const discover = createModelDiscovery(env, fetcher);
  const a = discover();
  const b = discover();
  expect(fetcher).toHaveBeenCalledTimes(1);
  release(Response.json({ models: [local] }));
  expect(await a).toEqual(await b);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const fresh = discover();
  expect(fetcher).toHaveBeenCalledTimes(3);
  release(Response.json({ models: [] }));
  expect((await fresh).models).toEqual([]);
});
it("never probes a cloud-named model even if tags advertise it", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ models: [{ ...local, name: "synthetic-cloud" }] }),
  );
  expect(
    (await createModelDiscovery(env, fetcher)()).models[0]!.available,
  ).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
