import { LlmGatewayError, type LlmGateway, type LlmResponse } from "./llm-gateway.js";

function parseProbe(response: LlmResponse): void {
  const content = response.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { throw new LlmGatewayError("Inference responded, but connectivity probe parsing failed", "malformed_response", true); }
  if (!value || typeof value !== "object" || (value as { status?: unknown }).status !== "ok") {
    throw new LlmGatewayError("Inference responded, but connectivity probe returned an unexpected value", "malformed_response", true);
  }
}

export async function checkLlmConnectivity(gateway: LlmGateway, maxRetries = 0): Promise<{ modelId: string; latencyMs: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await gateway.complete([
        { role: "system", content: "Return only this JSON object with no markdown: {\"status\":\"ok\"}" },
        { role: "user", content: "Connectivity check. Return the requested JSON now." }
      ]);
      parseProbe(response);
      return { modelId: response.modelId, latencyMs: response.latencyMs };
    } catch (error) {
      lastError = error;
      if (error instanceof LlmGatewayError && !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new LlmGatewayError("Cloudflare connectivity check failed", "network", true);
}
