import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createPlanningService,
} from "@helios/backend";
let instance: ReturnType<typeof createPlanningService> | undefined;
export function planning() {
  if (!instance) {
    const config = loadWorkConfig();
    instance = createPlanningService(
      createDatabase(config.DATABASE_URL),
      config,
    );
  }
  return instance;
}
