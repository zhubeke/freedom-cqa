import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../../config/config.js";
import { EVALUATION_COMPLETED_TOPIC } from "../../../evaluation-orchestration/adapters/events/topics.js";
import { processBatch, recordEvaluationCompletion } from "../../application/process-batch.js";
import { BATCH_REQUESTED_TOPIC } from "./topics.js";
import { BatchRepository } from "../persistence/batch-repository.js";

interface BatchPipelineEvent { batch_id?: string; evaluation_run_id?: string }

export class BatchConsumer {
  private readonly repository: BatchRepository;
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly db: Db, private readonly config: AppConfig) {
    this.repository = new BatchRepository(db);
  }
  async start() {
    await this.repository.ensureIndexes();
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [BATCH_REQUESTED_TOPIC, EVALUATION_COMPLETED_TOPIC], fromBeginning: true });
    await this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
  }
  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const event = JSON.parse(message.value.toString()) as BatchPipelineEvent;
    try {
      if (topic === BATCH_REQUESTED_TOPIC && event.batch_id) await processBatch(this.db, this.repository, this.producer, this.config, event.batch_id);
      if (topic === EVALUATION_COMPLETED_TOPIC && event.evaluation_run_id) await recordEvaluationCompletion(this.db, this.repository, this.producer, this.config, event.evaluation_run_id);
    } catch (error) {
      let batchId = event.batch_id;
      if (!batchId && event.evaluation_run_id) {
        const batch = await this.repository.collection().findOne({ "conversation_results.evaluation_run_id": event.evaluation_run_id });
        batchId = batch?.batch_id;
      }
      if (batchId) await this.repository.collection().updateOne(
        { batch_id: batchId, status: { $in: ["queued", "processing"] } },
        { $set: { status: "paused", last_error: error instanceof Error ? error.message : "Batch processing failed" } }
      );
    }
  }
  async close() { await this.consumer.disconnect(); }
}
