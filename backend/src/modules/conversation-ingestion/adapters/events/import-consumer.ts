import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { ImportRepository } from "../../../dataset-import/application/import-repository.js";
import type { ConversationRepository } from "../persistence/conversation-repository.js";
import { processImport } from "../../application/process-import.js";
import { DATASET_IMPORT_REQUESTED_TOPIC } from "./topics.js";

export class ImportConsumer {
  constructor(
    private readonly consumer: Consumer,
    private readonly producer: Producer,
    private readonly imports: ImportRepository,
    private readonly conversations: ConversationRepository
  ) {}

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: DATASET_IMPORT_REQUESTED_TOPIC, fromBeginning: true });
    await this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
  }

  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const event = JSON.parse(message.value.toString()) as { import_id?: string };
    if (!event.import_id) throw new Error("Import event is missing import_id");
    const item = await this.imports.find(event.import_id);
    if (!item || item.status === "completed") return;
    await processImport(event.import_id, this.imports, this.conversations, this.producer);
  }

  async close(): Promise<void> { await this.consumer.disconnect(); }
}
