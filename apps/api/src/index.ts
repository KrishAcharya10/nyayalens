import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { recoverInterruptedJobs } from "./jobs/recovery.js";

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`NyayaLens API listening on port ${env.API_PORT} (${env.NODE_ENV})`);
});

recoverInterruptedJobs().catch((err: unknown) => {
  console.error("Startup job recovery failed:", err);
});
