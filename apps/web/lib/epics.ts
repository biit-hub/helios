import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createEpicService,
} from "@helios/backend";
let instance: ReturnType<typeof createEpicService> | undefined;
export function epics() {
  if (!instance) {
    const config = loadWorkConfig();
    instance = createEpicService(createDatabase(config.DATABASE_URL), config);
  }
  return instance;
}
