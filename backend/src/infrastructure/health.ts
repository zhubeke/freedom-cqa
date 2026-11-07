export type DependencyName = "mongodb" | "redis" | "redpanda";

export interface HealthResult {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  message?: string;
}

export interface HealthCheck {
  check(): Promise<HealthResult>;
  close(): Promise<void>;
}

export async function measured(check: () => Promise<unknown>): Promise<HealthResult> {
  const startedAt = performance.now();
  try {
    await check();
    return { status: "healthy", latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return { status: "unhealthy", latencyMs: Math.round(performance.now() - startedAt), message };
  }
}
