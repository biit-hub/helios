"use client";
import { Badge, Icon, type BadgeTone } from "@helios/ui";
import { aiJobStatusNames, type AiJobStatus } from "@helios/contracts";
const presentation: Record<
  AiJobStatus,
  { tone: BadgeTone; icon: Parameters<typeof Icon>[0]["name"] }
> = {
  linking: { tone: "info", icon: "refresh" },
  queued: { tone: "neutral", icon: "wait" },
  running: { tone: "info", icon: "sparkles" },
  awaiting_input: { tone: "warning", icon: "progress" },
  ready: { tone: "success", icon: "check" },
  closed: { tone: "muted", icon: "check" },
  stopped: { tone: "muted", icon: "close" },
  error: { tone: "danger", icon: "problems" },
};
export function AiJobStatusBadge({
  status,
}: Readonly<{ status: AiJobStatus }>) {
  const value = presentation[status];
  return (
    <Badge tone={value.tone}>
      <Icon name={value.icon} />
      {aiJobStatusNames[status]}
    </Badge>
  );
}
