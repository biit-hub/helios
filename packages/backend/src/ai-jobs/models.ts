import { z } from "zod";
import type { AiJobModel } from "@helios/contracts";
import { aiConfig } from "../ai/config";
import { boundedOllamaText } from "../ai/ollama";
import { WorkFault } from "../work/service";

const installedModel = z.object({
  name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,150}$/),
  digest: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
  size: z.number().positive().safe(),
});
const catalog = z.object({ models: z.array(installedModel).max(32) });
const metadata = z.object({
  remote_host: z.unknown().optional(),
  remote_model: z.unknown().optional(),
  details: z.object({ format: z.string() }),
  capabilities: z.array(z.string()).max(32),
});
export type ModelCatalog = {
  models: AiJobModel[];
  connected: boolean;
  code: string | null;
};
export type ModelDiscovery = () => Promise<ModelCatalog>;

/** Only validates the shared private origin. The discovery label is never selected or run. */
export function createModelDiscovery(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): ModelDiscovery {
  const config = aiConfig({ ...env, OLLAMA_MODEL: "local-discovery" });
  async function discover(): Promise<ModelCatalog> {
    if (!config.base)
      return { models: [], connected: false, code: "AI_JOB_MODEL_UNAVAILABLE" };
    const base = config.base;
    const signal = AbortSignal.timeout(15000);
    async function inspect(
      model: z.infer<typeof installedModel>,
    ): Promise<AiJobModel> {
      const value = {
        ...model,
        local: false,
        available: false,
        reason: "AI_JOB_LOCAL_MODEL_REQUIRED",
      };
      if (/cloud/i.test(model.name)) return value;
      try {
        const response = await fetcher(base + "/api/show", {
          method: "POST",
          redirect: "error",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: model.name }),
        });
        if (!response.ok)
          return { ...value, reason: "AI_JOB_MODEL_UNAVAILABLE" };
        const info = metadata.parse(
          JSON.parse(await boundedOllamaText(response)),
        );
        if (
          info.remote_host ||
          info.remote_model ||
          info.details.format !== "gguf" ||
          !info.capabilities.includes("completion")
        )
          return value;
        return { ...value, local: true, available: true, reason: null };
      } catch {
        return value;
      }
    }
    try {
      const response = await fetcher(base + "/api/tags", {
        redirect: "error",
        signal,
      });
      if (!response.ok) throw new WorkFault("AI_JOB_MODEL_UNAVAILABLE", 503);
      const installed = catalog.parse(
        JSON.parse(await boundedOllamaText(response)),
      ).models;
      if (new Set(installed.map((m) => m.name)).size !== installed.length)
        throw new Error("Ambiguous model catalog");
      // Bounded batches: at most three metadata reads in flight, no inference/downloads.
      const groups = Array.from(
        { length: Math.ceil(installed.length / 3) },
        (_, i) => installed.slice(i * 3, i * 3 + 3),
      );
      const models = await groups.reduce(
        async (pending, group) => [
          ...(await pending),
          ...(await Promise.all(group.map(inspect))),
        ],
        Promise.resolve<AiJobModel[]>([]),
      );
      return { models, connected: true, code: null };
    } catch {
      return { models: [], connected: false, code: "AI_JOB_MODEL_UNAVAILABLE" };
    }
  }
  let pending: Promise<ModelCatalog> | undefined;
  return () => {
    pending ??= discover().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

export function selectedModel(catalog: ModelCatalog, name: string | null) {
  const model = catalog.models.find(
    (m) => m.name === name && m.available && m.local,
  );
  if (!catalog.connected || !model)
    throw new WorkFault("AI_JOB_MODEL_UNAVAILABLE", 409);
  return model;
}
