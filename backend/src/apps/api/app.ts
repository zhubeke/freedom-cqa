import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../../config/config.js";
import { createConnections } from "../../infrastructure/connections.js";
import { registerHealthRoutes } from "../../modules/health/routes.js";
import { registerSystemRoutes } from "../../modules/system/routes.js";
import { registerDatasetImportRoutes } from "../../modules/dataset-import/adapters/http/routes.js";
import { registerImportStatusRoutes } from "../../modules/import-status/adapters/http/routes.js";
import { registerConversationQueryRoutes } from "../../modules/conversation-query/adapters/http/routes.js";
import { registerChecklistManagementRoutes } from "../../modules/checklist-management/adapters/http/routes.js";
import { MongoChecklistRepository } from "../../modules/checklist-management/adapters/persistence/checklist-repository.js";
import { seedFreedomChecklist } from "../../modules/checklist-management/seed/seed-freedom-checklist.js";
import { registerEvaluationRoutes } from "../../modules/evaluation-orchestration/adapters/http/routes.js";
import { registerBatchRoutes } from "../../modules/batch-evaluation/adapters/http/routes.js";
import { registerMetadataRoutes } from "../../modules/conversation-metadata/adapters/http/routes.js";
import { registerClassificationRoutes } from "../../modules/action-classification/adapters/http/routes.js";
import { registerAudioIntelligenceRoutes } from "../../modules/audio-intelligence/adapters/http/routes.js";
import { registerAppealRoutes } from "../../modules/appeals/adapters/http/routes.js";
import { registerAnalyticsRoutes } from "../../modules/analytics/adapters/http/routes.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const connections = createConnections(config);

  await app.register(cors, { origin: true });
  await registerHealthRoutes(app, connections);
  await registerSystemRoutes(app, connections);

  const connectionAttempts = await Promise.allSettled([
    connections.mongodb.connect(),
    connections.redis.connect(),
    connections.redpanda.connect()
  ]);
  connectionAttempts.forEach((attempt, index) => {
    if (attempt.status === "rejected") {
      app.log.warn({ dependency: ["mongodb", "redis", "redpanda"][index], error: attempt.reason }, "Initial dependency connection failed");
    }
  });

  const producer = connections.redpanda.kafka.producer();
  await producer.connect();
  await registerDatasetImportRoutes(app, connections.mongodb.db, producer);
  await registerImportStatusRoutes(app, connections.mongodb.db);
  await registerConversationQueryRoutes(app, connections.mongodb.db);
  const checklistRepository = new MongoChecklistRepository(connections.mongodb.db);
  await seedFreedomChecklist(checklistRepository);
  await registerChecklistManagementRoutes(app, connections.mongodb.db);
  await registerEvaluationRoutes(app, connections.mongodb.db, producer, config);
  await registerBatchRoutes(app, connections.mongodb.db, producer, config);
  await registerMetadataRoutes(app, connections.mongodb.db, producer);
  await registerClassificationRoutes(app, connections.mongodb.db, producer, config);
  await registerAudioIntelligenceRoutes(app, connections.mongodb.db, producer);
  await registerAppealRoutes(app, connections.mongodb.db, producer);
  await registerAnalyticsRoutes(app, connections.mongodb.db);

  app.addHook("onClose", async () => {
    await Promise.allSettled([
      connections.mongodb.close(),
      connections.redis.close(),
      connections.redpanda.close(),
      producer.disconnect()
    ]);
  });

  return app;
}
