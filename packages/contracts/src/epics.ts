import type { TaskInspection, TodoistTask, AiOutput } from "./index";
export type EpicDetail = {
  inspection: TaskInspection;
  goal: string;
  checklist: { text: string; checked: boolean }[];
  markdownError: string | null;
  children: TodoistTask[];
  unknownChildren: { id: string; content: string }[];
  correction: string;
  correctionRevision: number;
  cache: {
    id: string;
    fresh: boolean;
    createdAt: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    output: AiOutput;
  } | null;
};
export type EpicListItem = {
  task: TodoistTask;
  state: string;
  retrievedAt: string;
  goal: string;
  goalConflict: boolean;
};
