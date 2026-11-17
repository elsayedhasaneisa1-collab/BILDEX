export function csrf() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(document.cookie.split("; ").find((row) => row.startsWith("bx_csrf="))?.split("=")[1] || "");
}

export async function api<T = Record<string, unknown>>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? { "x-csrf-token": csrf() } : { "content-type": "application/json", "x-csrf-token": csrf() },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
