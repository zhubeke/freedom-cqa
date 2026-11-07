import pRetry from "p-retry";
import type { AppConfig } from "../../../../config/config.js";
import { ACTION_CODES, type ActionCode, type ActionFeatures, type TabPfnPrediction } from "../../application/action.types.js";
import { ACTION_FEATURE_ORDER, approvedFeatureRow } from "../../application/feature-schema.js";

export class TabPfnError extends Error {
  constructor(message: string, public readonly category: "authentication" | "timeout" | "provider" | "invalid_response", public readonly retryable: boolean) { super(message); this.name = "TabPfnError"; }
}
interface UploadInfo { signed_urls: string[]; required_headers?: Record<string, string> }

function csvCell(value: unknown): string { if (value === null || value === undefined) return ""; const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function csv(rows: unknown[][], header?: readonly string[]): string { return [...(header ? [header] : []), ...rows].map((row) => row.map(csvCell).join(",")).join("\n"); }

export class TabPfnAdapter {
  constructor(private readonly config: AppConfig["tabpfn"], private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, init: RequestInit): Promise<any> {
    if (!this.config.apiKey) throw new TabPfnError("TABPFN_API_KEY is not configured", "authentication", false);
    return pRetry(async () => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(`${this.config.baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) throw new TabPfnError("Prior Labs rejected the configured API key", "authentication", false);
        if (!response.ok) throw new TabPfnError(`Prior Labs request failed with HTTP ${response.status}`, "provider", response.status === 429 || response.status >= 500);
        return payload;
      } catch (error) {
        if (error instanceof TabPfnError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new TabPfnError(`Prior Labs request timed out after ${this.config.timeoutMs}ms`, "timeout", true);
        throw new TabPfnError("Could not reach Prior Labs", "provider", true);
      } finally { clearTimeout(timer); }
    }, { retries: this.config.maxRetries, shouldRetry: (error) => error instanceof TabPfnError && error.retryable });
  }

  private async upload(info: UploadInfo, contents: string): Promise<void> {
    const url = info.signed_urls?.[0]; if (!url) throw new TabPfnError("Prior Labs did not return a signed upload URL", "invalid_response", false);
    const response = await this.fetcher(url, { method: "PUT", ...(info.required_headers ? { headers: info.required_headers } : {}), body: contents });
    if (!response.ok) throw new TabPfnError(`Prior Labs signed upload failed with HTTP ${response.status}`, "provider", response.status >= 500);
  }

  async fit(rows: Array<{ features: ActionFeatures; action: ActionCode }>): Promise<{ fitted_train_set_id: string; status: string }> {
    rows.forEach((row) => approvedFeatureRow(row.features));
    const prepared = await this.request("/tabpfn/prepare_train_set_upload", { method: "POST", body: JSON.stringify({ x_train_info: { format: "csv" }, y_train_info: { format: "csv" } }) });
    if (!prepared?.train_set_upload_id || !prepared.x_train_info || !prepared.y_train_info) throw new TabPfnError("Prior Labs returned an invalid train upload response", "invalid_response", false);
    await Promise.all([
      this.upload(prepared.x_train_info, csv(rows.map((row) => approvedFeatureRow(row.features)), ACTION_FEATURE_ORDER)),
      this.upload(prepared.y_train_info, csv(rows.map((row) => [row.action]), ["recommended_action"]))
    ]);
    const fitted = await this.request("/tabpfn/fit", { method: "POST", body: JSON.stringify({ train_set_upload_id: prepared.train_set_upload_id, task_config: { task: "classification", tabpfn_config: { model_path: this.config.modelId } }, text_handling: "simple" }) });
    if (!fitted?.fitted_train_set_id || !["pending", "completed"].includes(fitted.status)) throw new TabPfnError("Prior Labs returned an invalid fit response", "invalid_response", false);
    return fitted;
  }

  async fitStatus(fittedTrainSetId: string): Promise<{ fitted_train_set_id: string; status: "pending" | "completed" | "failed" }> {
    const response = await this.request(`/tabpfn/get_fit_status?fitted_train_set_id=${encodeURIComponent(fittedTrainSetId)}`, { method: "GET" });
    if (!response?.status || !["pending", "completed", "failed"].includes(response.status)) throw new TabPfnError("Prior Labs returned an invalid fit-status response", "invalid_response", false);
    return { fitted_train_set_id: fittedTrainSetId, status: response.status };
  }

  async predict(fittedTrainSetId: string, features: ActionFeatures, allowedClasses: ActionCode[]): Promise<TabPfnPrediction> {
    const row = approvedFeatureRow(features);
    const prepared = await this.request("/tabpfn/prepare_test_set_upload", { method: "POST", body: JSON.stringify({ fitted_train_set_id: fittedTrainSetId, x_test_info: { format: "csv" } }) });
    if (!prepared?.test_set_upload_id || !prepared.x_test_info) throw new TabPfnError("Prior Labs returned an invalid test upload response", "invalid_response", false);
    await this.upload(prepared.x_test_info, csv([row], ACTION_FEATURE_ORDER));
    const response = await this.request("/tabpfn/predict", { method: "POST", body: JSON.stringify({ test_set_upload_id: prepared.test_set_upload_id, fitted_train_set_id: fittedTrainSetId, task_config: { task: "classification", predict_params: { output_type: "probas" } } }) });
    const classes = response?.metadata?.classes;
    const values = response?.prediction?.[0];
    if (!Array.isArray(classes) || !Array.isArray(values) || classes.length !== values.length || !values.every((item: unknown) => typeof item === "number" && Number.isFinite(item))) throw new TabPfnError("Prior Labs returned an invalid probability response", "invalid_response", false);
    const probabilities: Partial<Record<ActionCode, number>> = {};
    classes.forEach((item: unknown, index: number) => { if (typeof item === "string" && ACTION_CODES.includes(item as ActionCode) && allowedClasses.includes(item as ActionCode)) probabilities[item as ActionCode] = values[index]; });
    const ranked = Object.entries(probabilities).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    if (!ranked.length || Object.keys(probabilities).length !== classes.length) throw new TabPfnError("Prior Labs predicted an untrained or unsupported action class", "invalid_response", false);
    return { action: ranked[0]![0] as ActionCode, confidence: ranked[0]![1]!, probabilities, model_id: fittedTrainSetId };
  }
}
