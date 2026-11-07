import type { FastifyInstance } from "fastify";
import type { Db, Document } from "mongodb";

interface AnalyticsQuery { datasetGroupId?: string; channel?: string; language?: string; action?: string }

export async function registerAnalyticsRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Querystring: AnalyticsQuery }>("/api/v1/analytics/dashboard", async (request) => {
    const match: Document = {};
    if (request.query.datasetGroupId) match.dataset_group_id = request.query.datasetGroupId;
    if (request.query.channel) match.normalized_channel = request.query.channel;
    if (request.query.language) match.normalized_language = request.query.language === "kz" ? "kk" : request.query.language;
    const conversations = await db.collection("conversations").find(match, { projection: { _id: 0, dataset_group_id: 1, conversation_id: 1, normalized_channel: 1, normalized_language: 1, duration_ms: 1 } }).toArray();
    const ids = conversations.map((item) => ({ dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }));
    const [runs, classifications, metadata, appeals, processing] = ids.length ? await Promise.all([
      latest(db, "evaluation_runs", ids, "completed_at", { status: "completed" }), latest(db, "classification_results", ids, "created_at", { status: { $in: ["completed", "fallback"] } }),
      latest(db, "conversation_metadata", ids, "created_at", {}), db.collection("appeals").find({ $or: ids }).toArray(),
      db.collection("evaluation_runs").find({ $or: ids }, { projection: { dataset_group_id: 1, conversation_id: 1, status: 1 } }).toArray()
    ]) : [[], [], [], [], []];
    const key = (x: any) => `${x.dataset_group_id}:${x.conversation_id}`; const actionById = new Map(classifications.map((x: any) => [key(x), x.final_action]));
    const included = request.query.action ? conversations.filter((x) => actionById.get(key(x)) === request.query.action) : conversations;
    const includedKeys = new Set(included.map(key)); const relevantRuns = runs.filter((x: any) => includedKeys.has(key(x))); const relevantMeta = metadata.filter((x: any) => includedKeys.has(key(x)));
    const scores = relevantRuns.map((x: any) => x.finalized_score ?? x.final_score).filter((x: unknown): x is number => typeof x === "number");
    const resolution = relevantMeta.map((x: any) => x.semantic?.resolution_and_follow_up?.status ?? x.semantic?.resolution?.status ?? x.deterministic?.resolution).filter(Boolean);
    const responseTimes = relevantMeta.map((x: any) => { const seconds = x.deterministic?.response_timing?.average_operator_response_seconds?.value; return typeof seconds === "number" ? seconds * 1000 : (x.deterministic?.operator_response_time_ms ?? x.operator_response_time_ms); }).filter((x: unknown): x is number => typeof x === "number");
    return {
      totals: { conversations: included.length, analyzed: relevantRuns.length, average_score: average(scores), severe_violations: relevantRuns.filter((x: any) => x.finalized_critical_flag ?? x.critical_flag).length, average_operator_response_ms: average(responseTimes) },
      score_distribution: buckets(scores),
      actions: count(included.map((x) => actionById.get(key(x)) ?? "UNCLASSIFIED")),
      languages: count(included.map((x) => x.normalized_language)), channels: count(included.map((x) => x.normalized_channel)),
      resolution: { resolved: resolution.filter((x: any) => x === "resolved" || x.resolved === true || x.value === "resolved").length, unresolved: resolution.filter((x: any) => x === "unresolved" || x.resolved === false || x.value === "unresolved").length },
      appeals: { pending: appeals.filter((x: any) => includedKeys.has(key(x)) && ["OPEN", "UNDER_REVIEW"].includes(x.status)).length, outcomes: count(appeals.filter((x: any) => includedKeys.has(key(x)) && ["CONFIRMED", "OVERRIDDEN"].includes(x.status)).map((x: any) => x.status)) },
      processing: count(processing.filter((x: any) => includedKeys.has(key(x))).map((x: any) => x.status))
    };
  });
}

function latest(db: Db, collection: string, ids: Document[], sortField: string, extra: Document) { return db.collection(collection).aggregate([{ $match: { $or: ids, ...extra } }, { $sort: { [sortField]: -1 } }, { $group: { _id: { dataset_group_id: "$dataset_group_id", conversation_id: "$conversation_id" }, item: { $first: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$item" } }]).toArray(); }
function average(values: number[]) { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null; }
function count(values: unknown[]) { const result: Record<string, number> = {}; for (const value of values) result[String(value)] = (result[String(value)] ?? 0) + 1; return result; }
function buckets(scores: number[]) { const labels = ["0-19", "20-39", "40-59", "60-79", "80-100"]; const values = [0, 0, 0, 0, 0]; for (const score of scores) values[Math.min(4, Math.floor(score / 20))]!++; return labels.map((label, index) => ({ label, count: values[index] })); }
