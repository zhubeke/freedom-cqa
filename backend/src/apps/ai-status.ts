import { loadConfig } from "../config/config.js";
import { CloudflareCredentialPool } from "../modules/llm-gateway/adapters/cloudflare-credential-pool.js";

const config = loadConfig();
const pool = new CloudflareCredentialPool(config.llm, fetch, config.llm.profiles ?? [], config.redis.url);
try {
  const rows = await pool.diagnostics();
  console.table(rows.map((row) => ({ Profile: row.profile, Configured: row.configured ? "Yes" : "No", Token: row.token, Permission: row.permission, Model: row.model, Capacity: row.capacity, Detail: row.detail ?? "" })));
  if (!rows.some((row) => row.configured)) process.exitCode = 2;
} finally { await pool.close(); }
