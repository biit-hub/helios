import "server-only";
import {
  createDatabase,
  createIdentityService,
  loadIdentityConfig,
} from "@helios/backend";
let service: ReturnType<typeof createIdentityService> | undefined;
export function identity() {
  if (!service) {
    const config = loadIdentityConfig();
    service = createIdentityService(
      createDatabase(config.DATABASE_URL),
      config,
    );
  }
  return service;
}
