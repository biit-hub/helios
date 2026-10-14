import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createTaskService,
} from "@helios/backend";
let instance: ReturnType<typeof createTaskService> | undefined;
export function tasks() {
  if (!instance) {
    const config = loadWorkConfig();
    instance = createTaskService(createDatabase(config.DATABASE_URL), config);
  }
  return instance;
}
