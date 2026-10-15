import type { IncomingMessage, ServerResponse } from "node:http";
export type OllamaControl = { mode: string; calls: number };
export async function ollamaFixture(
  req: IncomingMessage,
  res: ServerResponse,
  control: OllamaControl,
) {
  if (!req.url?.startsWith("/api/")) return false;
  if (req.url === "/api/tags") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        models: [
          { name: "synthetic-local", digest: "a".repeat(64), size: 1000 },
        ],
      }),
    );
    return true;
  }
  if (req.url === "/api/show") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        details: { format: "gguf" },
        capabilities: ["completion"],
      }),
    );
    return true;
  }
  if (req.url !== "/api/chat") return false;
  control.calls++;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000) throw Error("Synthetic request too large");
  }
  const body = JSON.parse(raw);
  const data = JSON.parse(body.messages[1].content);
  const system = body.messages[0].content as string;
  const input = data.originalInput as string;
  if (control.mode === "unavailable") {
    res.writeHead(503);
    res.end("{}");
    return true;
  }
  if (control.mode === "timeout") await new Promise((r) => setTimeout(r, 8000));
  if (control.mode === "invalid") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ done: true, message: { content: "{invalid" } }));
    return true;
  }
  const output: {
    clarity: string;
    feasibility: string;
    missing: string[];
    reason: string;
    nextStep: string | null;
    estimatedMinutes: number | null;
    uncertainty: string;
    patches: {
      kind: string;
      value: string;
      target: string | null;
      evidence: string;
      reason: string;
    }[];
  } = {
    clarity: "clear",
    feasibility: "executable",
    missing: [],
    reason: "Synthetische geprüfte Eingabe",
    nextStep: null,
    estimatedMinutes: null,
    uncertainty: "Synthetischer Test, keine verlässliche Aufwandmessung",
    patches: [],
  };
  const patch = (
    kind: string,
    value: string,
    evidence: string,
    target: string | null = null,
  ) => ({
    kind,
    value,
    evidence,
    target,
    reason: "Aus der synthetischen Eingabe belegbar",
  });
  if (system.includes("ERFASSUNG:")) {
    output.patches = [
      patch("title", input.split(".")[0]!, input.split(".")[0]!),
    ];
    const m = input.match(/(\d+) Minuten/);
    if (m) {
      output.patches.push(patch("remaining", m[1]!, m[0]));
      output.estimatedMinutes = Number(m[1]);
    }
  } else if (system.includes("FORTSCHRITT:")) {
    if (input.includes("Quellen gesammelt")) {
      output.patches.push(
        patch("comment", "Quellen wurden gesammelt.", "Quellen gesammelt"),
      );
      if (data.source?.task.description.includes("- [ ] Quellen sammeln"))
        output.patches.push(
          patch(
            "check-complete",
            "Quellen sammeln",
            "Quellen gesammelt",
            "Quellen sammeln",
          ),
        );
    }
    const m = input.match(/Noch (\d+) Minuten/);
    if (m) output.patches.push(patch("remaining", m[1]!, m[0]));
  } else if (data.source?.task.title.includes("Unklar")) {
    output.clarity = "needs_context";
    output.feasibility = "uncertain";
    output.reason = "Das konkrete gewünschte Ergebnis fehlt.";
    output.missing = ["Welches Ergebnis möchtest du erreichen?"];
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      model: "synthetic-local",
      done: true,
      done_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(output) },
    }),
  );
  return true;
}
