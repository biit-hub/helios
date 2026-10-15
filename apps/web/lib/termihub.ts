import "server-only";
import {
  createDatabase,
  loadWorkConfig,
  createTermiHubService,
} from "@helios/backend";
let instance: ReturnType<typeof createTermiHubService> | undefined;
export function termihub() {
  if (!instance) {
    const config = loadWorkConfig();
    instance = createTermiHubService(
      createDatabase(config.DATABASE_URL),
      config,
    );
  }
  return instance;
}
