import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import type { Db } from "mongodb";
import { validateDataset, DatasetValidationError } from "../../../conversation-ingestion/schemas/dataset.js";
import { createImport } from "../../application/create-import.js";
import { ImportRepository } from "../../application/import-repository.js";
import { publishPendingImports } from "../../application/publish-pending-imports.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function registerDatasetImportRoutes(app: FastifyInstance, db: Db, producer: Producer): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const repository = new ImportRepository(db);
  await repository.ensureIndexes();

  app.post("/api/v1/datasets/import", async (request, reply) => {
    try {
      let raw: Buffer;
      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) return reply.code(400).send({ error: "A JSON file is required" });
        if (file.mimetype !== "application/json" && !file.filename.toLowerCase().endsWith(".json")) {
          return reply.code(415).send({ error: "Only JSON files are supported" });
        }
        raw = await file.toBuffer();
      } else {
        if (request.body === undefined || request.body === null) return reply.code(400).send({ error: "JSON payload is required" });
        raw = Buffer.from(JSON.stringify(request.body));
      }
      if (!raw.length) return reply.code(400).send({ error: "JSON payload is required" });
      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString("utf8")); }
      catch { return reply.code(400).send({ error: "The uploaded file is not valid JSON" }); }
      const dataset = validateDataset(parsed);
      const item = await createImport(repository, dataset, raw);
      try {
        await publishPendingImports(repository, producer, item.import_id);
      } catch (error) {
        request.log.error({ error, importId: item.import_id }, "Import persisted but initial publication failed; worker recovery will retry");
      }
      return reply.code(202).send({
        import_id: item.import_id,
        dataset_group_id: item.dataset_group_id,
        status: item.status,
        total_records: item.total_records
      });
    } catch (error) {
      if (error instanceof DatasetValidationError) return reply.code(400).send({ error: error.message, details: error.details });
      throw error;
    }
  });

  app.get("/api/v1/datasets", async () => {
    const datasets = await repository.collection().aggregate([
      { $match: { status: "completed" } },
      { $sort: { processed_at: -1 } },
      { $group: {
        _id: "$dataset_group_id",
        import_id: { $first: "$import_id" },
        total_records: { $first: "$total_records" },
        imported_at: { $first: "$processed_at" }
      } },
      { $project: { _id: 0, dataset_group_id: "$_id", import_id: 1, total_records: 1, imported_at: 1 } }
    ]).toArray();
    return { datasets };
  });
}
