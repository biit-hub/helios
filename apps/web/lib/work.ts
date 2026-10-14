import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createWorkService,
} from "@helios/backend";
let service: ReturnType<typeof createWorkService> | undefined;
export function work() {
  if (!service) {
    const config = loadWorkConfig();
    service = createWorkService(createDatabase(config.DATABASE_URL), config);
  }
  return service;
}
