import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createAiJobService,
} from "@helios/backend";
let service: ReturnType<typeof createAiJobService> | undefined;
export function aiJobs() {
  if (!service) {
    const config = loadWorkConfig();
    service = createAiJobService(createDatabase(config.DATABASE_URL), config);
  }
  return service;
}
