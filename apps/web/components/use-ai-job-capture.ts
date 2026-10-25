"use client";
import { useEffect, useState } from "react";
import type {
  AiJobCreate,
  AiJobSettings,
  AiJobDetail,
  TaskInspection,
} from "@helios/contracts";
import { jobRequest, AiJobRequestError } from "./ai-job-client";
export type CaptureOrigin = { contextId: string; taskId: string };
const changed = () => window.dispatchEvent(new Event("helios:ai-jobs-changed"));
export function useAiJobCapture(origin?: CaptureOrigin) {
  const [capturedOrigin] = useState(origin);
  const [settings, setSettings] = useState<AiJobSettings | null>(null);
  const [source, setSource] = useState<TaskInspection | null>(null);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<AiJobCreate["output"]>("text");
  const [format, setFormat] =
    useState<NonNullable<AiJobCreate["format"]>>("docx");
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [created, setCreated] = useState<AiJobDetail | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      jobRequest<AiJobSettings>(
        "/api/ai-jobs/settings",
        undefined,
        abort.signal,
      ),
      capturedOrigin
        ? jobRequest<TaskInspection>(
            "/api/tasks?" + new URLSearchParams(capturedOrigin),
            undefined,
            abort.signal,
          )
        : Promise.resolve(null),
      capturedOrigin
        ? jobRequest<{ id: string | null }>(
            "/api/ai-jobs?" +
              new URLSearchParams({
                contextId: capturedOrigin.contextId,
                refTask: capturedOrigin.taskId,
              }),
            undefined,
            abort.signal,
          )
        : Promise.resolve({ id: null }),
    ])
      .then(([s, task, reference]) => {
        setExistingId(reference.id);
        setSettings(s);
        setSource(task);
        const enabled = s.outputs.find((o) => o.available);
        if (enabled) setOutput(enabled.output);
        if (task)
          setPrompt(
            (task.task.content + "\n\n" + task.task.description).slice(
              0,
              12000,
            ),
          );
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [capturedOrigin]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const value = await jobRequest<AiJobDetail>("/api/ai-jobs/create", {
        key,
        prompt,
        output,
        format: output === "file" ? format : null,
        origin:
          capturedOrigin && source
            ? { ...capturedOrigin, basis: source.basis }
            : null,
      });
      setCreated(value);
      setUnknown(false);
      changed();
    } catch (e) {
      setError((e as Error).message);
      // Admission may have committed before the detail read or response failed.
      if (
        !(e instanceof AiJobRequestError) ||
        e.status >= 500 ||
        [401, 403, 408].includes(e.status)
      )
        setUnknown(true);
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    setBusy(true);
    setError("");
    try {
      setCreated(await jobRequest<AiJobDetail>("/api/ai-jobs?id=" + key));
      setUnknown(false);
      changed();
    } catch (e) {
      setError(
        (e as Error).message + " Nicht erneut mit einer neuen ID anlegen.",
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = settings?.outputs.find((s) => s.output === output);
  return {
    id: key,
    settings,
    source,
    prompt,
    setPrompt,
    output,
    setOutput,
    format,
    setFormat,
    busy,
    error,
    unknown,
    created,
    existingId,
    selected,
    submit,
    reconcile,
    dirty: !!prompt.trim() && !created && !existingId,
    locked: busy || unknown || !settings || (!!capturedOrigin && !source),
    canSubmit:
      !busy &&
      !!selected?.available &&
      !!prompt.trim() &&
      (!capturedOrigin || !!source),
    delegated: !!capturedOrigin,
  };
}
export type CaptureController = ReturnType<typeof useAiJobCapture>;
