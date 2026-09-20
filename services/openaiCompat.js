import {
  FUNCTION_DECLARATIONS,
  MAX_TOOL_TURNS,
  makeToolExecutor
} from "./agent.js";

// Converts agent.js's Gemini-shaped tool schema into OpenAI's
// function-calling shape ({type:"function", function:{name, description,
// parameters}}), same conversion ollama.js does for Ollama's native API.
function toOpenAIFunctionSchema(geminiSchema) {
  if (!geminiSchema) return { type: "object", properties: {} };
  const properties = {};
  for (const [key, val] of Object.entries(geminiSchema.properties || {})) {
    properties[key] = { type: String(val.type || "STRING").toLowerCase(), description: val.description };
  }
  return { type: "object", properties, required: geminiSchema.required || [] };
}

const TOOLS = FUNCTION_DECLARATIONS.map((fn) => ({
  type: "function",
  function: {
    name: fn.name,
    description: fn.description,
    parameters: toOpenAIFunctionSchema(fn.parameters)
  }
}));

function parseToolArgs(rawArgs) {
  if (rawArgs && typeof rawArgs === "object") return rawArgs;
  if (typeof rawArgs === "string") {
    try { return JSON.parse(rawArgs); } catch { return {}; }
  }
  return {};
}

/**
 * Factory for any true OpenAI-compatible POST /chat/completions provider
 * (Groq, OpenRouter, Cerebras, Mistral, ...). Model ids in config/models.js
 * for these providers are prefixed (e.g. "groq:llama-3.3-70b-versatile") so
 * routes/api.js can tell which provider a request should go to; stripPrefix
 * removes it to get the exact model string the provider's API expects.
 *
 * Mirrors services/ollama.js's onStep event shapes (status/tool_call/
 * tool_result) so the frontend's SSE handling works unmodified regardless
 * of provider.
 */
export function createOpenAICompatProvider({ id, prefix, baseUrl, extraHeaders }) {
  function stripPrefix(modelId) {
    return modelId?.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
  }

  async function callOnce({ apiKey, modelId, messages, useTools }) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(extraHeaders || {})
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        ...(useTools ? { tools: TOOLS } : {})
      })
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(body);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function callFailMessage(err) {
    const hint = err.status === 401 || err.status === 403
      ? ` (${id.toUpperCase()}_API_KEY galat ya missing lag raha hai)`
      : err.status === 429
        ? ` (${id} free-tier rate limit lag gayi — thori der baad retry karein ya doosra model/provider select karein)`
        : "";
    return `${id} call fail hui (${err.status ?? "network error"})${hint}: ${String(err.message).slice(0, 400)}`;
  }

  /** Agentic loop, used by /api/agent/chat. Same tool-calling contract as
   * runAgentLoop (Gemini) and runOllamaAgentLoop. */
  async function runAgentLoop({ apiKey, modelId, workspaceDir, messages: inputMessages, systemInstruction, onStep }) {
    const rawModelId = stripPrefix(modelId);
    const execTool = makeToolExecutor(workspaceDir, onStep);

    const messages = [];
    if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
    for (const m of inputMessages) {
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content ?? "" });
    }

    onStep({ type: "status", text: `${rawModelId} (${id}) soch raha hoon...` });

    let data;
    try {
      data = await callOnce({ apiKey, modelId: rawModelId, messages, useTools: true });
    } catch (err) {
      throw new Error(callFailMessage(err));
    }

    let turns = 0;
    while (true) {
      const message = data?.choices?.[0]?.message;
      if (!message) {
        throw new Error(`${id} se khaali response mila. Raw: ${JSON.stringify(data).slice(0, 400)}`);
      }

      const toolCalls = message.tool_calls || [];
      const text = message.content || "";

      if (toolCalls.length === 0) {
        return { text: text || "(khaali jawab mila)", usedModel: `${prefix}${rawModelId}` };
      }

      turns += 1;
      if (turns > MAX_TOOL_TURNS) {
        const fallbackText = text || "Bohot zyada steps ho gaye — ruk raha hoon taake infinite loop na bane. Jo ab tak ban chuka hai wo workspace mein maujood hai.";
        return { text: fallbackText, usedModel: `${prefix}${rawModelId}` };
      }

      messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });

      for (const tc of toolCalls) {
        const fn = tc.function || {};
        const args = parseToolArgs(fn.arguments);
        onStep({ type: "tool_call", tool: fn.name, args });

        let result;
        let ok = true;
        try {
          result = await execTool(fn.name, args);
        } catch (err) {
          ok = false;
          result = { error: err.message };
        }
        onStep({ type: "tool_result", tool: fn.name, ok, args, result });
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      onStep({ type: "status", text: "Agla step soch raha hoon..." });
      try {
        data = await callOnce({ apiKey, modelId: rawModelId, messages, useTools: true });
      } catch (err) {
        throw new Error(callFailMessage(err));
      }
    }
  }

  /** Non-agentic single-turn chat (used by /api/chat), mirrors callGemini's
   * return contract: { usedModel, data, fallbackUsed, attempts }. */
  async function callChat({ apiKey, modelId, messages: inputMessages, systemInstruction }) {
    const rawModelId = stripPrefix(modelId);
    const messages = [];
    if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
    for (const m of inputMessages) messages.push(m);

    const data = await callOnce({ apiKey, modelId: rawModelId, messages, useTools: false });
    return { usedModel: `${prefix}${rawModelId}`, data, fallbackUsed: false, attempts: [] };
  }

  return { id, prefix, stripPrefix, runAgentLoop, callChat };
}
