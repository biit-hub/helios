import { z } from "zod";
import { aiOutput } from "@helios/contracts";
import type { AiDraftView, AiOutput } from "@helios/contracts";
import type { AiConfig } from "./config";
import { prompt, outputSchema } from "./prompt";
import { WorkFault } from "../work/service";
export type AiGenerate = (
  kind: AiDraftView["kind"],
  data: unknown,
  signal?: AbortSignal,
) => Promise<AiOutput>;
async function boundedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new WorkFault("AI_INVALID_OUTPUT", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 65536) throw new WorkFault("AI_INVALID_OUTPUT", 502);
      chunks.push(r.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel();
  }
}
export function createOllama(
  config: AiConfig,
  fetcher: typeof fetch = fetch,
): AiGenerate {
  return async (kind, data, signal) => {
    if (!config.enabled || !config.base)
      throw new WorkFault("AI_UNAVAILABLE", 503);
    const timer = AbortSignal.timeout(config.timeout);
    const combined = signal ? AbortSignal.any([timer, signal]) : timer;
    try {
      const info = await fetcher(config.base + "/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: combined,
        body: JSON.stringify({ model: config.model }),
      });
      if (!info.ok)
        throw new WorkFault(
          info.status === 404 ? "AI_MODEL_MISSING" : "AI_UNAVAILABLE",
          503,
        );
      const metadata = JSON.parse(await boundedText(info));
      if (
        metadata.remote_host ||
        metadata.remote_model ||
        metadata.details?.format !== "gguf" ||
        !metadata.capabilities?.includes("completion")
      )
        throw new WorkFault("AI_LOCAL_MODEL_REQUIRED", 503);
      const tags = await fetcher(config.base + "/api/tags", {
        redirect: "error",
        signal: combined,
      });
      if (!tags.ok) throw new WorkFault("AI_UNAVAILABLE", 503);
      const catalog = JSON.parse(await boundedText(tags));
      const installed = Array.isArray(catalog.models)
        ? catalog.models.find(
            (m: unknown) =>
              m &&
              typeof m === "object" &&
              (m as { name?: string }).name === config.model,
          )
        : null;
      if (
        !installed ||
        typeof installed.digest !== "string" ||
        !/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/.test(installed.digest) ||
        !(installed.size > 0)
      )
        throw new WorkFault("AI_LOCAL_MODEL_REQUIRED", 503);
      const r = await fetcher(config.base + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: combined,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: outputSchema(kind),
          messages: [
            { role: "system", content: prompt(kind) },
            { role: "user", content: JSON.stringify(data) },
          ],
          options: { temperature: 0, num_ctx: 8192, num_predict: 1800 },
          keep_alive: "5m",
        }),
      });
      if (!r.ok)
        throw new WorkFault(
          r.status === 404 ? "AI_MODEL_MISSING" : "AI_UNAVAILABLE",
          503,
        );
      const envelope = JSON.parse(await boundedText(r));
      if (
        envelope.done !== true ||
        envelope.done_reason === "length" ||
        envelope.model?.includes("cloud") ||
        envelope.message?.tool_calls?.length
      )
        throw new WorkFault("AI_INVALID_OUTPUT", 502);
      return {
        ...aiOutput.parse(JSON.parse(envelope.message.content)),
        modelDigest: installed.digest,
      };
    } catch (e) {
      if (e instanceof WorkFault) throw e;
      if (combined.aborted)
        throw new WorkFault(
          signal?.aborted ? "AI_CANCELLED" : "AI_TIMEOUT",
          503,
        );
      if (e instanceof z.ZodError || e instanceof SyntaxError)
        throw new WorkFault("AI_INVALID_OUTPUT", 502);
      throw new WorkFault("AI_UNAVAILABLE", 503);
    }
  };
}
