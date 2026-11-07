const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });

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
