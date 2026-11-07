import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Connections } from "../../infrastructure/connections.js";

const ServiceHealthSchema = Type.Object({
  status: Type.Union([Type.Literal("healthy"), Type.Literal("unhealthy")]),
  latencyMs: Type.Number(),
  message: Type.Optional(Type.String())
});

const ReadinessSchema = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("not_ready")]),
  checkedAt: Type.String(),
  services: Type.Object({
    mongodb: ServiceHealthSchema,
    redis: ServiceHealthSchema,
    redpanda: ServiceHealthSchema
  })
});

export async function registerHealthRoutes(app: FastifyInstance, connections: Connections): Promise<void> {
  app.get("/health/live", {
    schema: {
      response: { 200: Type.Object({ status: Type.Literal("alive"), checkedAt: Type.String() }) }
    }
  }, async () => ({ status: "alive" as const, checkedAt: new Date().toISOString() }));

  app.get("/health/ready", {
    schema: { response: { 200: ReadinessSchema, 503: ReadinessSchema } }
  }, async (_request, reply) => {
    const [mongodb, redis, redpanda] = await Promise.all([
      connections.mongodb.check(),
      connections.redis.check(),
      connections.redpanda.check()
    ]);
    const ready = [mongodb, redis, redpanda].every((service) => service.status === "healthy");
    const response = {
      status: ready ? "ready" as const : "not_ready" as const,
      checkedAt: new Date().toISOString(),
      services: { mongodb, redis, redpanda }
    };
    return reply.code(ready ? 200 : 503).send(response);
  });
}
