import { createServer } from "node:http";
import { loadConfig } from "../../config/config.js";
import { createConnections } from "../../infrastructure/connections.js";
import { ImportRepository } from "../../modules/dataset-import/application/import-repository.js";
import { publishPendingImports } from "../../modules/dataset-import/application/publish-pending-imports.js";
import { ConversationRepository } from "../../modules/conversation-ingestion/adapters/persistence/conversation-repository.js";
import { ImportConsumer } from "../../modules/conversation-ingestion/adapters/events/import-consumer.js";
import { CONVERSATION_INGESTED_TOPIC, DATASET_IMPORT_REQUESTED_TOPIC } from "../../modules/conversation-ingestion/adapters/events/topics.js";
import { EvaluationRepository } from "../../modules/criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { EvaluationConsumer } from "../../modules/criterion-evaluation/adapters/events/evaluation-consumer.js";
import { publishPendingEvaluations } from "../../modules/evaluation-orchestration/application/publish-pending-evaluations.js";
import { CRITERION_COMPLETED_TOPIC, CRITERION_REQUESTED_TOPIC, EVALUATION_COMPLETED_TOPIC, EVALUATION_REQUESTED_TOPIC } from "../../modules/evaluation-orchestration/adapters/events/topics.js";
import { BatchRepository } from "../../modules/batch-evaluation/adapters/persistence/batch-repository.js";
import { BatchConsumer } from "../../modules/batch-evaluation/adapters/events/batch-consumer.js";
import { BATCH_COMPLETED_TOPIC, BATCH_REQUESTED_TOPIC } from "../../modules/batch-evaluation/adapters/events/topics.js";
import { publishPendingBatches, publishPendingBatchCompletions } from "../../modules/batch-evaluation/application/publish-pending-batches.js";
import { publishPendingEvaluationCompletions } from "../../modules/evaluation-orchestration/application/publish-pending-completions.js";
import { MetadataRepository } from "../../modules/conversation-metadata/adapters/persistence/metadata-repository.js";
import { MetadataConsumer } from "../../modules/conversation-metadata/adapters/events/metadata-consumer.js";
import { IngestionDispatchConsumer } from "../../modules/conversation-metadata/adapters/events/ingestion-dispatch-consumer.js";
import { AUDIO_ANALYZED_TOPIC, AUDIO_REQUESTED_TOPIC, METADATA_COMPLETED_TOPIC, METADATA_REQUESTED_TOPIC, SENTIMENT_COMPLETED_TOPIC, SENTIMENT_REQUESTED_TOPIC } from "../../modules/conversation-metadata/adapters/events/topics.js";
import { CloudflareGateway, createLlmLimiter } from "../../modules/llm-gateway/adapters/cloudflare-gateway.js";
import { publishPendingMetadataCompletions } from "../../modules/conversation-metadata/application/publish-pending.js";
import { SentimentRepository } from "../../modules/conversation-metadata/adapters/persistence/sentiment-repository.js";
import { SentimentConsumer } from "../../modules/conversation-metadata/adapters/events/sentiment-consumer.js";
import { CloudflareCredentialPool } from "../../modules/llm-gateway/adapters/cloudflare-credential-pool.js";
import { ClassificationRepository } from "../../modules/action-classification/adapters/persistence/classification-repository.js";
import { ClassificationConsumer } from "../../modules/action-classification/adapters/events/classification-consumer.js";
import { ClassificationTriggerConsumer } from "../../modules/action-classification/adapters/events/classification-trigger-consumer.js";
import { ACTION_CLASSIFIED_TOPIC, CLASSIFICATION_REQUESTED_TOPIC } from "../../modules/action-classification/adapters/events/topics.js";
import { TabPfnAdapter } from "../../modules/action-classification/adapters/tabpfn/tabpfn-adapter.js";
import { publishPendingClassifications } from "../../modules/action-classification/application/publish-pending.js";

const config = loadConfig();
const connections = createConnections(config);
await connections.mongodb.connect();
await connections.redpanda.connect();
const imports = new ImportRepository(connections.mongodb.db);
const conversations = new ConversationRepository(connections.mongodb.db);
await Promise.all([imports.ensureIndexes(), conversations.ensureIndexes()]);
const evaluations = new EvaluationRepository(connections.mongodb.db);
await evaluations.ensureIndexes();
const batches = new BatchRepository(connections.mongodb.db);
await batches.ensureIndexes();
const metadata = new MetadataRepository(connections.mongodb.db);
await metadata.ensureIndexes();
const sentiments = new SentimentRepository(connections.mongodb.db);
await sentiments.ensureIndexes();
const classifications = new ClassificationRepository(connections.mongodb.db);
await classifications.ensureIndexes();
const llmGateway = config.llm.credentialPoolEnabled && config.llm.profiles?.some((profile) => profile.enabled)
  ? new CloudflareCredentialPool(config.llm, fetch, config.llm.profiles, config.redis.url)
  : new CloudflareGateway(config.llm, fetch, createLlmLimiter(config.llm));
const tabpfn = new TabPfnAdapter(config.tabpfn);

const admin = connections.redpanda.kafka.admin();
await admin.connect();
await admin.createTopics({ waitForLeaders: true, topics: [
  { topic: DATASET_IMPORT_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: CONVERSATION_INGESTED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: EVALUATION_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: CRITERION_REQUESTED_TOPIC, numPartitions: Math.max(1, config.llm.maxConcurrency), replicationFactor: 1 },
  { topic: CRITERION_COMPLETED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: EVALUATION_COMPLETED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: BATCH_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: BATCH_COMPLETED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: METADATA_REQUESTED_TOPIC, numPartitions: Math.max(1, Math.min(4, config.llm.maxConcurrency)), replicationFactor: 1 }
  ,{ topic: METADATA_COMPLETED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: AUDIO_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: AUDIO_ANALYZED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: SENTIMENT_REQUESTED_TOPIC, numPartitions: Math.max(1, Math.min(2, config.llm.maxConcurrency)), replicationFactor: 1 }
  ,{ topic: SENTIMENT_COMPLETED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: CLASSIFICATION_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 }
  ,{ topic: ACTION_CLASSIFIED_TOPIC, numPartitions: 1, replicationFactor: 1 }
] });
await admin.disconnect();

const producer = connections.redpanda.kafka.producer({ allowAutoTopicCreation: false });
await producer.connect();
const consumer = new ImportConsumer(
  connections.redpanda.kafka.consumer({ groupId: config.kafka.consumerGroupId, retry: { retries: 8 } }),
  producer,
  imports,
  conversations
);
await consumer.start();
const evaluationConsumer = new EvaluationConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-evaluations`, retry: { retries: 8 } }),
  producer,
  connections.mongodb.db,
  config,
  llmGateway
);
await evaluationConsumer.start();
const batchConsumer = new BatchConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-batches`, retry: { retries: 8 } }),
  producer,
  connections.mongodb.db,
  config
);
await batchConsumer.start();
const dispatchConsumer = new IngestionDispatchConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-metadata-dispatch`, retry: { retries: 8 } }),
  producer,
  metadata
);
await dispatchConsumer.start();
const metadataConsumer = new MetadataConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-metadata`, retry: { retries: 8 } }),
  producer,
  metadata,
  llmGateway
);
await metadataConsumer.start();
const sentimentConsumer = new SentimentConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-sentiment`, retry: { retries: 8 } }),
  producer,
  sentiments,
  llmGateway,
  config.sentiment.batchSize
);
await sentimentConsumer.start();
const classificationConsumer = new ClassificationConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-classifications`, retry: { retries: 8 } }), producer, classifications, tabpfn, config
);
await classificationConsumer.start();
const classificationTriggerConsumer = new ClassificationTriggerConsumer(
  connections.redpanda.kafka.consumer({ groupId: `${config.kafka.consumerGroupId}-classification-triggers`, retry: { retries: 8 } }), producer, classifications, connections.mongodb.db
);
await classificationTriggerConsumer.start();

let ready = true;
const recovery = async () => {
  try { await Promise.all([publishPendingImports(imports, producer), publishPendingEvaluations(evaluations, producer), publishPendingEvaluationCompletions(evaluations, producer), publishPendingBatches(batches, producer), publishPendingBatchCompletions(batches, producer), publishPendingMetadataCompletions(metadata, producer), publishPendingClassifications(classifications, producer), evaluationConsumer.recoverDeferredRetries()]); ready = true; }
  catch (error) { ready = false; console.error("Pending publication recovery failed", error); }
};
await recovery();
const recoveryTimer = setInterval(() => void recovery(), 10_000);

const healthServer = createServer(async (_request, response) => {
  const [mongodb, redpanda] = await Promise.all([connections.mongodb.check(), connections.redpanda.check()]);
  const healthy = ready && mongodb.status === "healthy" && redpanda.status === "healthy";
  response.statusCode = healthy ? 200 : 503;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ status: healthy ? "ready" : "not_ready", services: { mongodb, redpanda } }));
});
healthServer.listen(3001, "0.0.0.0");

const shutdown = async () => {
  ready = false;
  clearInterval(recoveryTimer);
  healthServer.close();
  await Promise.allSettled([consumer.close(), evaluationConsumer.close(), batchConsumer.close(), dispatchConsumer.close(), metadataConsumer.close(), sentimentConsumer.close(), classificationConsumer.close(), classificationTriggerConsumer.close(), producer.disconnect(), connections.mongodb.close(), connections.redpanda.close()]);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
