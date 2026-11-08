import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { Db } from "mongodb";
import { EVALUATION_COMPLETED_TOPIC } from "../../../evaluation-orchestration/adapters/events/topics.js";
import { METADATA_COMPLETED_TOPIC } from "../../../conversation-metadata/adapters/events/topics.js";
import { publishClassificationRequested } from "../../application/events.js";
import type { ClassificationRepository } from "../persistence/classification-repository.js";

export class ClassificationTriggerConsumer {
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly repository: ClassificationRepository, private readonly db: Db) {}
  async start() { await this.consumer.connect(); await this.consumer.subscribe({ topics: [EVALUATION_COMPLETED_TOPIC, METADATA_COMPLETED_TOPIC], fromBeginning: true }); await this.consumer.run({ eachMessage: (payload) => this.handle(payload) }); }
  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return; const source = JSON.parse(message.value.toString()) as any;
    if (source.status === "failed") return;
    let groupId = source.dataset_group_id as string | undefined;
    if (!groupId && topic === EVALUATION_COMPLETED_TOPIC && source.evaluation_run_id) groupId = (await this.db.collection("evaluation_runs").findOne({ run_id: source.evaluation_run_id }, { projection: { dataset_group_id: 1 } }))?.dataset_group_id as string | undefined;
    if (!groupId || !source.conversation_id) return;
    const queued = await this.repository.queue(groupId, source.conversation_id, false, `classification:${String(source.event_id)}`); if (!queued.duplicate) await publishClassificationRequested(this.producer, queued.event);
  }
  close() { return this.consumer.disconnect(); }
}
