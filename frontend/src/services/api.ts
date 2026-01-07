const API_URL = "http://localhost:3000/api";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    let msg = "API error";
    try {
      const parsed = text ? JSON.parse(text) : {};
      msg = parsed?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  // ✅ gestisce 204 No Content
  if (res.status === 204 || !text) return undefined as T;

  return JSON.parse(text) as T;
}
