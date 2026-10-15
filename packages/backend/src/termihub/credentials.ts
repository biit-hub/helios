import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { symmetricEncrypt } from "better-auth/crypto";
import { z } from "zod";
import type { createDatabase } from "../db";
import { createIdentityService } from "../identity/service";
import { integrations } from "../work/schema";
import type { WorkConfig } from "../work/config";
import { WorkFault } from "../work/service";
import { integrationFor } from "./store";
import {
  cleanOrigin,
  resolveTarget,
  type Resolver,
  type TermiHubNetworkConfig,
} from "./transport";
const revisionInput = z.strictObject({
  revision: z.number().int().nonnegative(),
});
const saveInput = revisionInput.extend({
  baseUrl: z.string().trim().min(1).max(2048),
  token: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .regex(/^[!-~]+$/),
});
export function connectionActions(
  database: ReturnType<typeof createDatabase>,
  config: WorkConfig,
  network: TermiHubNetworkConfig,
  resolver?: Resolver,
) {
  const identity = createIdentityService(database, config);
  async function save(headers: Headers, input: unknown) {
    const data = saveInput.parse(input);
    const initial = await identity.withActive(
      headers,
      { mutation: true, stepUp: true },
      async (db, userId) => {
        const i = await integrationFor(db, userId, true);
        if (!i || i.revision !== data.revision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        return i;
      },
    );
    if (!config.INTEGRATION_KEY) throw new WorkFault("KEY_UNAVAILABLE", 503);
    const baseUrl = cleanOrigin(data.baseUrl).origin;
    // DNS/TLS target policy is checked outside the identity transaction.
    await resolveTarget(baseUrl, network, resolver);
    const encryptedToken = await symmetricEncrypt({
      key: config.INTEGRATION_KEY,
      data: data.token,
    });
    return identity.withActive(
      headers,
      { mutation: true, stepUp: true },
      async (db, userId) => {
        const i = await integrationFor(db, userId);
        if (
          !i ||
          i.id !== initial.id ||
          i.revision !== initial.revision ||
          i.credentialVersion !== initial.credentialVersion
        )
          throw new WorkFault("REVISION_CONFLICT", 409);
        const revision = i.revision + 1;
        await db
          .update(integrations)
          .set({
            baseUrl,
            encryptedToken,
            enabled: true,
            revision,
            credentialVersion: randomUUID(),
            state: "saved",
            readClaim: null,
            syncClaimUntil: null,
            syncRequest: null,
            lastCheckedAt: null,
            lastCatalogAt: null,
            lastSyncAt: null,
            nextAllowedAt: null,
          })
          .where(eq(integrations.id, i.id));
        return { revision };
      },
    );
  }
  async function change(
    action: "enable" | "disable" | "remove",
    headers: Headers,
    input: unknown,
  ) {
    const data = revisionInput.parse(input);
    return identity.withActive(
      headers,
      { mutation: true, stepUp: true },
      async (db, userId) => {
        const i = await integrationFor(db, userId);
        if (!i || i.revision !== data.revision)
          throw new WorkFault("REVISION_CONFLICT", 409);
        if (action === "enable" && (!i.encryptedToken || !i.baseUrl))
          throw new WorkFault("TERMIHUB_NOT_CONNECTED", 409);
        if (action === "enable" && !config.INTEGRATION_KEY)
          throw new WorkFault("KEY_UNAVAILABLE", 503);
        const revision = i.revision + 1;
        await db
          .update(integrations)
          .set({
            revision,
            credentialVersion: randomUUID(),
            enabled: action === "enable",
            state:
              action === "remove"
                ? "not_connected"
                : action === "enable"
                  ? "saved"
                  : "disabled",
            ...(action === "remove"
              ? { encryptedToken: null, baseUrl: null }
              : {}),
            readClaim: null,
            syncClaimUntil: null,
            syncRequest: null,
            nextAllowedAt: null,
            lastCheckedAt: null,
            lastCatalogAt: null,
            lastSyncAt: null,
          })
          .where(eq(integrations.id, i.id));
        return { revision };
      },
    );
  }
  return { save, change };
}
