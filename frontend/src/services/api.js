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

  const requestId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `req-${Math.random().toString(36).slice(2, 11)}`;
  headers["X-Request-ID"] = requestId;

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
  } catch {
    const networkError = new Error(`Failed to reach API at ${url}. Check backend URL/CORS/protocol settings. (request id: ${requestId})`);
    networkError.requestId = requestId;
    throw networkError;
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
    const resRequestId = res.headers.get("x-request-id") || requestId;
    const baseMessage = payload?.detail || payload?.message || `API request failed (${res.status})`;
    const errorMessage = baseMessage.includes("request id:")
      ? baseMessage
      : `${baseMessage} (request id: ${resRequestId})`;
    const apiError = new Error(errorMessage);
    apiError.requestId = resRequestId;
    apiError.status = res.status;
    apiError.payload = payload;
    throw apiError;
  }

  return payload;
}


export const examApi = {
  listTeacherExams: (token) => apiRequest("/exams/", "GET", null, token),
  listStudentExams: (token) => apiRequest("/exams/", "GET", null, token),
  createExam: (payload, token) => apiRequest("/exams/", "POST", payload, token),
  updateExam: (examId, payload, token) => apiRequest(`/exams/${examId}`, "PUT", payload, token),
  publishExam: (examId, payload, token) => apiRequest(`/exams/${examId}/publish`, "PATCH", payload, token),
  endExam: (examId, token) => apiRequest(`/exams/${examId}/end`, "PATCH", null, token),
  publishResults: (examId, token) => apiRequest(`/exams/${examId}/publish-results`, "PATCH", null, token),
  getCompletedExamAnalytics: (examId, token) => apiRequest(`/exams/${examId}/analytics`, "GET", null, token),
  getViolationReport: (examId, format = "json", download = false, token) =>
    apiRequest(`/exams/${examId}/violation-report?format=${encodeURIComponent(format)}&download=${download ? "true" : "false"}`, "GET", null, token),
  deleteExam: (examId, token) => apiRequest(`/exams/${examId}`, "DELETE", null, token),
  listAvailableExams: (token) => apiRequest("/exams/available", "GET", null, token),
  startExamAttempt: (examId, token) => apiRequest(`/exams/${examId}/start`, "POST", null, token),
};

export const sessionApi = {
  startExamSession: (examId, token, payload = null) =>
    apiRequest(`/sessions/${examId}/start`, "POST", payload, token),
};

export const attemptApi = {
  saveAnswer: (attemptId, payload, token) => apiRequest(`/attempts/${attemptId}/save-answer`, "POST", payload, token),
  submitAttempt: (attemptId, token) => apiRequest(`/attempts/${attemptId}/submit`, "POST", null, token),
  resumeAttempt: (examId, token) => apiRequest(`/attempts/${examId}/resume`, "GET", null, token),
  evaluateAttempt: (attemptId, payload, token) => apiRequest(`/attempts/${attemptId}/evaluate`, "PATCH", payload, token),
  getResult: (examId, token) => apiRequest(`/results/${examId}`, "GET", null, token),
};

export const gradingApi = {
  getAttemptReview: (examId, attemptId, token) =>
    apiRequest(`/exams/${examId}/attempts/${attemptId}`, "GET", null, token),
  patchAttemptGrade: (examId, attemptId, payload, token) =>
    apiRequest(`/exams/${examId}/attempts/${attemptId}/grade`, "PATCH", payload, token),
};
