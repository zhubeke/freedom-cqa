import { createServer } from "node:http";
import { loadConfig } from "../../config/config.js";
import { createConnections } from "../../infrastructure/connections.js";
import { ImportRepository } from "../../modules/dataset-import/application/import-repository.js";
import { publishPendingImports } from "../../modules/dataset-import/application/publish-pending-imports.js";
import { ConversationRepository } from "../../modules/conversation-ingestion/adapters/persistence/conversation-repository.js";
import { ImportConsumer } from "../../modules/conversation-ingestion/adapters/events/import-consumer.js";
import { CONVERSATION_INGESTED_TOPIC, DATASET_IMPORT_REQUESTED_TOPIC } from "../../modules/conversation-ingestion/adapters/events/topics.js";

const config = loadConfig();
const connections = createConnections(config);
await connections.mongodb.connect();
await connections.redpanda.connect();
const imports = new ImportRepository(connections.mongodb.db);
const conversations = new ConversationRepository(connections.mongodb.db);
await Promise.all([imports.ensureIndexes(), conversations.ensureIndexes()]);

const admin = connections.redpanda.kafka.admin();
await admin.connect();
await admin.createTopics({ waitForLeaders: true, topics: [
  { topic: DATASET_IMPORT_REQUESTED_TOPIC, numPartitions: 1, replicationFactor: 1 },
  { topic: CONVERSATION_INGESTED_TOPIC, numPartitions: 1, replicationFactor: 1 }
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

let ready = true;
const recovery = async () => {
  try { await publishPendingImports(imports, producer); ready = true; }
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
  await Promise.allSettled([consumer.close(), producer.disconnect(), connections.mongodb.close(), connections.redpanda.close()]);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
