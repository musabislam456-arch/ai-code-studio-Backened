import { buildFallbackOrder } from "../config/models.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function callGemini({ apiKey, modelId, contents, systemInstruction, tools }) {
  const order = buildFallbackOrder(modelId);
  const attempts = [];

  for (const candidate of order) {
    try {
      const res = await fetch(
        `${GEMINI_BASE}/models/${candidate}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: systemInstruction
              ? { parts: [{ text: systemInstruction }] }
              : undefined,
            tools
          })
        }
      );

      if (!res.ok) {
        const body = await res.text();
        attempts.push({ model: candidate, status: res.status, body });
        // Any failure (404 retired, 429 quota, 400 bad request, 5xx server
        // error, access-not-granted, etc.) moves on to the next candidate
        // in the fallback chain instead of aborting the whole request.
        continue;
      }

      const data = await res.json();
      return { usedModel: candidate, data, fallbackUsed: candidate !== modelId, attempts };
    } catch (err) {
      attempts.push({ model: candidate, status: null, body: err.message });
      continue;
    }
  }

  // Every candidate failed. Surface the error for the model the user
  // actually picked (attempts[0]) first — that's the one they need to
  // act on — and summarize how many fallbacks were also tried.
  const primary = attempts[0];
  const primaryMsg = primary?.body || "unknown error";
  const extra = attempts.length > 1
    ? ` (${attempts.length - 1} fallback model(s) also failed: ${attempts.slice(1).map(a => a.model).join(", ")})`
    : "";
  const err = new Error(`All models failed. First tried "${primary?.model}" → ${primary?.status ?? "network error"}: ${primaryMsg}${extra}`);
  err.attempts = attempts;
  throw err;
}
