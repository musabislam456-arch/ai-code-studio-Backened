import {
  FUNCTION_DECLARATIONS,
  MAX_TOOL_TURNS,
  makeToolExecutor
} from "./agent.js";

// Ollama's hosted Cloud API — same request/response shape as a local
// `ollama serve`, just pointed at ollama.com with a Bearer API key instead
// of localhost:11434. Override with OLLAMA_BASE_URL if you ever want to
// point this at a self-hosted Ollama instance instead.
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "https://ollama.com").replace(/\/$/, "");

// Ollama's /api/chat "tools" param follows the OpenAI function-calling
// shape (type: "function", function: {name, description, parameters}).
// Converted once from the same FUNCTION_DECLARATIONS agent.js uses for
// Gemini, so both providers expose identical tools.
function toOllamaTypeSchema(geminiSchema) {
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
    parameters: toOllamaTypeSchema(fn.parameters)
  }
}));

/** Strips the "ollama:" prefix used in the model dropdown/config to get the
 * real tag Ollama's API expects, e.g. "ollama:qwen3-coder:480b-cloud" ->
 * "qwen3-coder:480b-cloud". */
export function stripOllamaPrefix(modelId) {
  return modelId?.startsWith("ollama:") ? modelId.slice("ollama:".length) : modelId;
}

async function callOllamaOnce({ apiKey, modelId, messages }) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages, tools: TOOLS, stream: false })
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(body);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function parseToolArgs(rawArgs) {
  if (rawArgs && typeof rawArgs === "object") return rawArgs;
  if (typeof rawArgs === "string") {
    try { return JSON.parse(rawArgs); } catch { return {}; }
  }
  return {};
}

/**
 * Ollama Cloud equivalent of agent.js's runAgentLoop. Deliberately emits the
 * exact same onStep event shapes (status/tool_call/tool_result/command_output)
 * as the Gemini loop so the frontend's SSE handling, live activity list, and
 * click-to-preview UI work unmodified regardless of which provider ran.
 */
export async function runOllamaAgentLoop({ apiKey, modelId, workspaceDir, messages: inputMessages, systemInstruction, onStep }) {
  const rawModelId = stripOllamaPrefix(modelId);
  const execTool = makeToolExecutor(workspaceDir, onStep);

  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  for (const m of inputMessages) {
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content ?? "" });
  }

  onStep({ type: "status", text: `${rawModelId} (Ollama) soch raha hoon...` });

  let data;
  try {
    data = await callOllamaOnce({ apiKey, modelId: rawModelId, messages });
  } catch (err) {
    const hint = err.status === 401 || err.status === 403
      ? " (OLLAMA_API_KEY galat ya missing lag raha hai)"
      : err.status === 429
        ? " (Ollama free-tier rate limit lag gayi — chota model try karo, e.g. ollama:gpt-oss:20b-cloud)"
        : "";
    throw new Error(`Ollama call fail hui (${err.status ?? "network error"})${hint}: ${String(err.message).slice(0, 400)}`);
  }

  let turns = 0;

  while (true) {
    const message = data?.message;
    if (!message) {
      throw new Error(`Ollama se khaali response mila. Raw: ${JSON.stringify(data).slice(0, 400)}`);
    }

    const toolCalls = message.tool_calls || [];
    const text = message.content || "";

    if (toolCalls.length === 0) {
      return { text: text || "(khaali jawab mila)", usedModel: `ollama:${rawModelId}` };
    }

    turns += 1;
    if (turns > MAX_TOOL_TURNS) {
      const fallbackText = text || "Bohot zyada steps ho gaye — ruk raha hoon taake infinite loop na bane. Jo ab tak ban chuka hai wo workspace mein maujood hai.";
      return { text: fallbackText, usedModel: `ollama:${rawModelId}` };
    }

    messages.push({ role: "assistant", content: text || "", tool_calls: toolCalls });

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
      messages.push({ role: "tool", tool_name: fn.name, content: JSON.stringify(result) });
    }

    onStep({ type: "status", text: "Agla step soch raha hoon..." });
    data = await callOllamaOnce({ apiKey, modelId: rawModelId, messages });
  }
}

/** Non-agentic single-turn chat (used by /api/chat), mirrors callGemini's
 * return contract: { usedModel, data }. */
export async function callOllamaChat({ apiKey, modelId, messages: inputMessages, systemInstruction }) {
  const rawModelId = stripOllamaPrefix(modelId);
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  for (const m of inputMessages) messages.push(m);

  const data = await callOllamaOnce({ apiKey, modelId: rawModelId, messages });
  return { usedModel: `ollama:${rawModelId}`, data, fallbackUsed: false, attempts: [] };
}
