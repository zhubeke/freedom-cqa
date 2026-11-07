import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { ImportRepository } from "../../../dataset-import/application/import-repository.js";
import { getImportStatus } from "../../application/get-import-status.js";

export async function registerImportStatusRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const repository = new ImportRepository(db);
  app.get<{ Params: { id: string } }>("/api/v1/imports/:id", async (request, reply) => {
    const status = await getImportStatus(repository, request.params.id);
    return status ?? reply.code(404).send({ error: "Import not found" });
  });
}
