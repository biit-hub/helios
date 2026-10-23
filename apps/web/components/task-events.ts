import type { TaskCommand } from "@helios/contracts";
export const taskChangedEvent = "helios:task-verified";
export type VerifiedTaskChange = {
  contextId: string | null;
  action: TaskCommand["action"];
  taskId?: string;
};
export function announceTaskChange(change: VerifiedTaskChange) {
  window.dispatchEvent(new CustomEvent(taskChangedEvent, { detail: change }));
}
