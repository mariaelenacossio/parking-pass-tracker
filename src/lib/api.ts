/**
 * Client-side fetch helper. Parses a JSON body when present and throws an
 * Error with a useful message on non-2xx responses (including the HTML error
 * pages Next.js returns for unhandled 500s).
 */
export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status}). Please try again.`;
    throw new Error(message);
  }

  return body as T;
}
