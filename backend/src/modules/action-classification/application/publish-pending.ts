import type { Producer } from "kafkajs";
import type { ClassificationRepository } from "../adapters/persistence/classification-repository.js";
import { publishClassificationCompleted } from "./events.js";
export async function publishPendingClassifications(repository: ClassificationRepository, producer: Producer) { const results = await repository.pendingPublications(); for (const result of results) { await publishClassificationCompleted(producer, result); await repository.markPublished(result.result_id); } return results.length; }
