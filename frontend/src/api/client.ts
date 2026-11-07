const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public readonly status: number | null, message: string, public readonly kind: "api" | "network" | "timeout" = "api") {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ApiError(null, "The API did not respond within 10 seconds.", "timeout");
    throw new ApiError(null, "The application could not reach the API. Check the network connection and try again.", "network");
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(response.status, payload.error ?? `API request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `API request failed with status ${response.status}`);
  return payload;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `Upload failed with status ${response.status}`);
  return payload as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(response.status, payload.error ?? `Download failed with status ${response.status}`);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
