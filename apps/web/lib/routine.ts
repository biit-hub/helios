import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createRoutineService,
} from "@helios/backend";
let service: ReturnType<typeof createRoutineService> | undefined;
export function routine() {
  if (!service) {
    const config = loadWorkConfig();
    service = createRoutineService(createDatabase(config.DATABASE_URL), config);
  }
  return service;
}
