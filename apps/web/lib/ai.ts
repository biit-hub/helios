import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createAiService,
} from "@helios/backend";
let service: ReturnType<typeof createAiService> | undefined;
export function ai() {
  if (!service) {
    const c = loadWorkConfig();
    service = createAiService(createDatabase(c.DATABASE_URL), c);
  }
  return service;
}
