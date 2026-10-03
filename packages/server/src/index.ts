import "dotenv/config";
import * as path from "node:path";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";

const config = loadConfig(process.env, { uiDistDir: path.join(__dirname, "../../ui/dist") });
const db = openDatabase(config.dbPath);
const app = createApp(config, db);

const server = app.express.listen(config.port, () => {
  console.log(`[server] listening on ${config.publicServerUrl} (port ${config.port})`);
  console.log(
    `[server] sign-in: ${config.loginMode}; session cookies: ${config.secureCookies ? "Secure (https)" : "not Secure (http)"}; UI: ${config.uiDistDir ? "served from this process" : "not served (run the UI separately)"}`,
  );
  if (config.loginMode === "dev") {
    console.warn("[server] Google sign-in is not configured -- using the development-only stub login. See README to add real credentials.");
  } else if (config.loginMode === "none") {
    console.warn("[server] No sign-in method is enabled (set GOOGLE_CLIENT_ID/SECRET, or ALLOW_DEV_LOGIN=true for testing).");
  }
});

// Containers stop with SIGTERM: finish in-flight requests, then close the database cleanly.
function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => {
    app.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
