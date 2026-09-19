import { buildFallbackOrder } from "../config/models.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function isRetryableModelError(status) {
  // Retry model availability/provider errors, but do not immediately send the
  // same large request to every model after a 429 quota/rate-limit response.
  return [400, 404, 408, 409, 500, 502, 503, 504].includes(Number(status));
}

export async function callGemini({ apiKey, modelId, contents, systemInstruction, tools }) {
  const order = buildFallbackOrder(modelId);
  const attempts = [];

  for (const candidate of order) {
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${candidate}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          tools
        })
      });

      if (!res.ok) {
        const body = await res.text();
        attempts.push({ model: candidate, status: res.status, body });
        if (!isRetryableModelError(res.status)) break;
        continue;
      }

      const data = await res.json();
      return { usedModel: candidate, data, fallbackUsed: candidate !== modelId, attempts };
    } catch (err) {
      attempts.push({ model: candidate, status: null, body: err.message });
      continue;
    }
  }

  const primary = attempts[0];
  const primaryMsg = String(primary?.body || "unknown error").replace(/\s+/g, " ").slice(0, 600);
  if (primary?.status === 429) {
    const err = new Error(`Gemini quota/rate limit (429) hit for ${primary.model}. The same request was not sent through the whole fallback chain because that would consume more quota. Details: ${primaryMsg}`);
    err.attempts = attempts;
    err.status = 429;
    throw err;
  }

  const extra = attempts.length > 1 ? ` (${attempts.length - 1} fallback model(s) also failed: ${attempts.slice(1).map(a => a.model).join(", ")})` : "";
  const err = new Error(`Gemini request failed. First tried "${primary?.model}" → ${primary?.status ?? "network error"}: ${primaryMsg}${extra}`);
  err.attempts = attempts;
  err.status = primary?.status;
  throw err;
}
