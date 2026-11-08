import { loadConfig } from "../config/config.js";
import { createLlmGateway } from "../modules/llm-gateway/adapters/create-llm-gateway.js";
import { DeepSeekGateway } from "../modules/llm-gateway/adapters/deepseek-gateway.js";
import { checkLlmConnectivity } from "../modules/llm-gateway/application/check-connectivity.js";
import { LlmGatewayError } from "../modules/llm-gateway/application/llm-gateway.js";

try {
  const config = loadConfig();
  const fallbackOnly = process.argv.includes("--fallback");
  if (fallbackOnly && !config.llm.deepseek?.enabled) throw new LlmGatewayError("DeepSeek fallback is not enabled", "configuration", false);
  const gateway = fallbackOnly ? new DeepSeekGateway(config.llm.deepseek!) : createLlmGateway(config.llm);
  const result = await checkLlmConnectivity(gateway, 0);
  console.log(`AI inference connectivity: OK (mode=${fallbackOnly ? "deepseek-only" : `${config.llm.provider}-first`}, model=${result.modelId}, latency_ms=${result.latencyMs})`);
} catch (error) {
  if (error instanceof LlmGatewayError) {
    console.error(`AI inference connectivity: FAILED (category=${error.category}${error.statusCode ? `, http_status=${error.statusCode}` : ""})`);
    console.error(error.message);
  } else {
    console.error("AI inference connectivity: FAILED (category=configuration)");
    console.error(error instanceof Error ? error.message : "Unknown configuration error");
  }
  process.exitCode = 1;
}
