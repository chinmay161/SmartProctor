const RAW_API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const API_BASE = RAW_API_BASE.replace(/\/+$/, "");

const buildUrl = (path) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

export async function apiRequest(path, method = "GET", body = null, token) {
  const headers = {};
  const hasBody = body !== null && body !== undefined;
  const url = buildUrl(path);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`Failed to reach API at ${url}. Check backend URL/CORS/protocol settings.`);
  }

  let payload = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await res.json();
  } else {
    const text = await res.text();
    payload = text ? { detail: text } : null;
  }

  if (!res.ok) {
    throw new Error(payload?.detail || payload?.message || `API request failed (${res.status})`);
  }

  return payload;
}
