import { loadConfig } from "../config/config.js";
import { CloudflareGateway } from "../modules/llm-gateway/adapters/cloudflare-gateway.js";
import { checkLlmConnectivity } from "../modules/llm-gateway/application/check-connectivity.js";
import { LlmGatewayError } from "../modules/llm-gateway/application/llm-gateway.js";

try {
  const config = loadConfig();
  const result = await checkLlmConnectivity(new CloudflareGateway(config.llm), config.llm.maxRetries);
  console.log(`Cloudflare inference connectivity: OK (provider=${config.llm.provider}, model=${result.modelId}, latency_ms=${result.latencyMs})`);
} catch (error) {
  if (error instanceof LlmGatewayError) {
    console.error(`Cloudflare inference connectivity: FAILED (category=${error.category}${error.statusCode ? `, http_status=${error.statusCode}` : ""})`);
    console.error(error.message);
  } else {
    console.error("Cloudflare inference connectivity: FAILED (category=configuration)");
    console.error(error instanceof Error ? error.message : "Unknown configuration error");
  }
  process.exitCode = 1;
}
