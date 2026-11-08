import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Connections } from "../../infrastructure/connections.js";

const ServiceHealthSchema = Type.Object({
  status: Type.Union([Type.Literal("healthy"), Type.Literal("unhealthy")]),
  latencyMs: Type.Number(),
  message: Type.Optional(Type.String())
});

const SystemStatusSchema = Type.Object({
  status: Type.Union([Type.Literal("healthy"), Type.Literal("unhealthy")]),
  checkedAt: Type.String(),
  services: Type.Object({
    backend: ServiceHealthSchema,
    mongodb: ServiceHealthSchema,
    redis: ServiceHealthSchema,
    redpanda: ServiceHealthSchema
  })
});

export async function registerSystemRoutes(app: FastifyInstance, connections: Connections): Promise<void> {
  app.get("/api/v1/system/status", {
    schema: { response: { 200: SystemStatusSchema } }
  }, async () => {
    const [mongodb, redis, redpanda] = await Promise.all([
      connections.mongodb.check(),
      connections.redis.check(),
      connections.redpanda.check()
    ]);
    const dependenciesHealthy = [mongodb, redis, redpanda].every((service) => service.status === "healthy");

    return {
      status: dependenciesHealthy ? "healthy" as const : "unhealthy" as const,
      checkedAt: new Date().toISOString(),
      services: {
        backend: { status: "healthy" as const, latencyMs: 0 },
        mongodb,
        redis,
        redpanda
      }
    };
  });
}
