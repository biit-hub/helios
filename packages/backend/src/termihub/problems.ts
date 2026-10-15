import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { ProblemCode } from "@helios/contracts";
import { integrationProblems } from "../work/schema";
import type { Db } from "../planning/store";
import type { TermiIntegration } from "./store";
const codes: Record<string, ProblemCode> = {
  TERMIHUB_AUTH: "termihub_auth",
  TERMIHUB_PERMISSION: "termihub_permission",
  TERMIHUB_UNREACHABLE: "termihub_network",
  TERMIHUB_TIMEOUT: "termihub_timeout",
  TERMIHUB_RATE_LIMIT: "termihub_rate_limit",
  KEY_UNAVAILABLE: "termihub_key",
  TERMIHUB_URL_INVALID: "termihub_configuration",
  TERMIHUB_URL_BLOCKED: "termihub_configuration",
  TERMIHUB_INCOMPLETE: "termihub_incomplete",
};
export async function recordTermiHubProblem(
  db: Db,
  integration: TermiIntegration,
  fault: string,
) {
  const code = codes[fault] ?? "termihub_contract",
    key = integration.id + ":global:" + code;
  await db
    .insert(integrationProblems)
    .values({
      id: randomUUID(),
      userId: integration.userId,
      integrationId: integration.id,
      key,
      code,
    })
    .onConflictDoUpdate({
      target: integrationProblems.key,
      set: {
        occurrences: sql`${integrationProblems.occurrences}+1`,
        revision: sql`${integrationProblems.revision}+1`,
        lastSeenAt: new Date(),
        status: sql`CASE WHEN ${integrationProblems.status}='resolved' THEN 'open' ELSE ${integrationProblems.status} END`,
        resolvedAt: null,
      },
    });
}
export async function resolveTermiHubProblems(
  db: Db,
  integration: TermiIntegration,
  complete: boolean,
) {
  for (const code of [
    ...new Set([...Object.values(codes), "termihub_contract" as const]),
  ]) {
    if (code === "termihub_incomplete" && !complete) continue;
    await db
      .update(integrationProblems)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        revision: sql`${integrationProblems.revision}+1`,
      })
      .where(
        and(
          eq(integrationProblems.key, integration.id + ":global:" + code),
          sql`${integrationProblems.status}<>'resolved'`,
        ),
      );
  }
}
