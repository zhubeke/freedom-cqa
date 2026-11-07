import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import type { Db, Filter } from "mongodb";
import { AUDIO_REQUESTED_TOPIC } from "../events/topics.js";

type IdentityResult =
  | { ok: true; record: Record<string, any> }
  | { ok: false; error: 404 | 409; message: string };
type LoadResult =
  | { ok: true; value: Record<string, any> }
  | { ok: false; error: 404 | 409; message: string };

const IdParams = Type.Object({ id: Type.String({ minLength: 1 }) });
const AnalyzeBody = Type.Object({ force: Type.Optional(Type.Boolean()), datasetGroupId: Type.Optional(Type.String()) });
const Query = Type.Object({ datasetGroupId: Type.Optional(Type.String()) });
const allowedHosts = new Set((process.env.CQA_AUDIO_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const maxPlaybackBytes = Number(process.env.CQA_AUDIO_MAX_DOWNLOAD_BYTES ?? 104_857_600);

function publicAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return false;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return isIP(address) === 6;
  const [a=0,b=0]=parts;
  return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
}
async function safeUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname.toLowerCase())) throw new Error("Audio source is not permitted");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) throw new Error("Audio source resolves to a private address");
  return url;
}
function embeddedMedia(body: string, base: URL): URL | null {
  const html = body.match(/<(?:audio|source)[^>]+src=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&");
  if (html) return new URL(html, base);
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    for (const key of ["url","audio_url","download_url","media_url"]) if (typeof json[key] === "string") return new URL(json[key] as string, base);
  } catch { /* response is not JSON */ }
  return null;
}
async function resolvePlayback(reference: string, range?: string): Promise<Response> {
  let current=await safeUrl(reference);
  for(let attempt=0;attempt<6;attempt++){
    const response=await fetch(current,{redirect:"manual",headers:{Accept:"audio/*, application/octet-stream, application/json, text/html",...(range?{Range:range}:{})}});
    if([301,302,303,307,308].includes(response.status)){ const location=response.headers.get("location"); if(!location)throw new Error("Audio redirect is invalid"); current=await safeUrl(new URL(location,current).toString()); continue; }
    const contentType=(response.headers.get("content-type")??"").split(";")[0]!.toLowerCase();
    if(contentType==="text/html"||contentType==="application/json"||contentType.endsWith("+json")){
      const declared=Number(response.headers.get("content-length")??0); if(declared>2_097_152)throw new Error("Audio resolver response is too large");
      const body=(await response.text()).slice(0,2_097_152); const candidate=embeddedMedia(body,current); if(!candidate)throw new Error("Audio resolver did not provide media");
      current=await safeUrl(candidate.toString()); continue;
    }
    if(!contentType.startsWith("audio/")&&!contentType.startsWith("video/")&&contentType!=="application/octet-stream")throw new Error("Audio content type is unsupported");
    const length=Number(response.headers.get("content-length")??0); if(length>maxPlaybackBytes)throw new Error("Audio source exceeds configured size");
    return response;
  }
  throw new Error("Audio source exceeded redirect limit");
}

async function identity(db: Db, id: string, datasetGroupId?: string): Promise<IdentityResult> {
  const filter: Filter<Record<string, unknown>> = { conversation_id: id };
  if (datasetGroupId) filter.dataset_group_id = datasetGroupId;
  const records = await db.collection("conversations").find(filter, { projection: { _id: 0, dataset_group_id: 1, conversation_id: 1, has_audio: 1 } }).limit(2).toArray();
  if (!records.length) return { ok: false, error: 404, message: "Conversation not found" };
  if (records.length > 1) return { ok: false, error: 409, message: "datasetGroupId is required because the conversation ID is ambiguous" };
  return { ok: true, record: records[0]! };
}

function sanitize(document: Record<string, any> | null) {
  if (!document) return null;
  const { _id, source_audio_reference: _reference, ...safe } = document;
  return { ...safe, audio_metrics_id: _id?.toString() };
}

export async function registerAudioIntelligenceRoutes(app: FastifyInstance, db: Db, producer: Producer): Promise<void> {
  app.get<{ Params:{id:string}; Querystring:{datasetGroupId?:string} }>("/api/v1/conversations/:id/audio", { schema:{params:IdParams,querystring:Query} }, async(request,reply)=>{
    const found=await identity(db,request.params.id,request.query.datasetGroupId); if(!found.ok)return reply.code(found.error).send({error:found.message});
    const conversation=await db.collection("conversations").findOne({dataset_group_id:found.record.dataset_group_id,conversation_id:found.record.conversation_id},{projection:{audio_url:1}});
    if(!conversation?.audio_url)return reply.code(404).send({error:"AUDIO_NOT_AVAILABLE"});
    try{
      const response=await resolvePlayback(String(conversation.audio_url),request.headers.range);
      reply.code(response.status===206?206:200).header("content-type",response.headers.get("content-type")??"audio/mpeg").header("accept-ranges",response.headers.get("accept-ranges")??"bytes").header("cache-control","private, no-store");
      for(const header of ["content-length","content-range"]) { const value=response.headers.get(header); if(value)reply.header(header,value); }
      if(!response.body)return reply.code(502).send({error:"AUDIO_DOWNLOAD_FAILED"});
      return reply.send(Readable.fromWeb(response.body as never));
    }catch{return reply.code(502).send({error:"AUDIO_DOWNLOAD_FAILED"});}
  });
  app.post<{ Params: { id: string }; Body: { force?: boolean; datasetGroupId?: string } }>("/api/v1/conversations/:id/audio/analyze", { schema: { params: IdParams, body: AnalyzeBody } }, async (request, reply) => {
    const found = await identity(db, request.params.id, request.body.datasetGroupId);
    if (!found.ok) return reply.code(found.error).send({ error: found.message });
    if (!found.record.has_audio) return reply.code(422).send({ error: "AUDIO_NOT_AVAILABLE" });
    const lookup = { dataset_group_id: found.record.dataset_group_id, conversation_id: found.record.conversation_id };
    if (!request.body.force) {
      const completed = await db.collection("audio_metrics").findOne({ ...lookup, status: { $in: ["completed", "partial"] } }, { sort: { processing_completed_at: -1 } });
      if (completed) return reply.code(200).send(sanitize(completed));
      const pending = await db.collection("audio_jobs").findOne({ ...lookup, status: { $in: ["queued", "processing"] } }, { sort: { updated_at: -1 } });
      if (pending) return reply.code(202).send(sanitize(pending));
    }
    const eventId = randomUUID(), analysisRunId = randomUUID(), now = new Date();
    const event = { event_id: eventId, event_type: "cqa.audio.requested", event_version: 1, occurred_at: now.toISOString(), correlation_id: eventId, dataset_group_id: found.record.dataset_group_id, conversation_id: found.record.conversation_id, analysis_run_id: analysisRunId, force_reanalysis: Boolean(request.body.force) };
    await db.collection("audio_jobs").updateOne({ source_event_id: eventId }, { $set: { ...lookup, source_event_id: eventId, analysis_run_id: analysisRunId, status: "queued", created_at: now, updated_at: now } }, { upsert: true });
    try { await producer.send({ topic: AUDIO_REQUESTED_TOPIC, messages: [{ key: `${found.record.dataset_group_id}:${found.record.conversation_id}`, value: JSON.stringify(event) }] }); }
    catch (error) { await db.collection("audio_jobs").updateOne({ source_event_id: eventId }, { $set: { status: "publish_failed", updated_at: new Date() } }); throw error; }
    return reply.code(202).send({ status: "queued", analysis_run_id: analysisRunId });
  });

  const load = async (id: string, datasetGroupId?: string): Promise<LoadResult> => {
    const found = await identity(db, id, datasetGroupId); if (!found.ok) return found;
    const lookup = { dataset_group_id: found.record.dataset_group_id, conversation_id: found.record.conversation_id };
    const metrics = await db.collection("audio_metrics").findOne(lookup, { sort: { processing_completed_at: -1 } });
    if (metrics) return { ok: true, value: sanitize(metrics)! };
    const job = await db.collection("audio_jobs").findOne(lookup, { sort: { updated_at: -1 } });
    return { ok: true, value: sanitize(job) ?? { ...lookup, status: "not_analyzed" } };
  };

  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/audio-analysis", { schema: { params: IdParams, querystring: Query } }, async (request, reply) => {
    const result = await load(request.params.id, request.query.datasetGroupId); return !result.ok ? reply.code(result.error).send({ error: result.message }) : result.value;
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/audio-analysis/status", { schema: { params: IdParams, querystring: Query } }, async (request, reply) => {
    const result = await load(request.params.id, request.query.datasetGroupId); if (!result.ok) return reply.code(result.error).send({ error: result.message });
    const value = result.value as Record<string, any>; return { status: value.status, analysis_run_id: value.analysis_run_id, error_code: value.error_code, updated_at: value.updated_at ?? value.processing_completed_at };
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/audio-analysis/segments", { schema: { params: IdParams, querystring: Query } }, async (request, reply) => {
    const result = await load(request.params.id, request.query.datasetGroupId); if (!result.ok) return reply.code(result.error).send({ error: result.message });
    const value = result.value as Record<string, any>; return { status: value.status, diarization_segments: value.diarization_segments ?? [], exclusive_diarization_segments: value.exclusive_diarization_segments ?? [], overlap_segments: value.overlap_segments ?? [] };
  });
}
