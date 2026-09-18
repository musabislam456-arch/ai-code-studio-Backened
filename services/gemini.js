import { buildFallbackOrder } from "../config/models.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function callGemini({ apiKey, modelId, contents, systemInstruction, tools }) {
  const order = buildFallbackOrder(modelId);
  let lastError;

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
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`Model ${candidate} failed with ${res.status}`);
          continue;
        }
        const body = await res.text();
        throw new Error(`Gemini error ${res.status}: ${body}`);
      }

      const data = await res.json();
      return { usedModel: candidate, data };
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All models in fallback chain failed.");
}
