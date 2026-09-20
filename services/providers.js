import { createOpenAICompatProvider } from "./openaiCompat.js";

// Free-tier OpenAI-compatible providers. Ollama and Gemini have their own
// dedicated services (ollama.js, gemini.js/agent.js) because their APIs
// aren't plain OpenAI /chat/completions — everything here is.
export const groqProvider = createOpenAICompatProvider({
  id: "groq",
  prefix: "groq:",
  baseUrl: "https://api.groq.com/openai/v1"
});

export const openrouterProvider = createOpenAICompatProvider({
  id: "openrouter",
  prefix: "openrouter:",
  baseUrl: "https://openrouter.ai/api/v1",
  // OpenRouter asks free-tier callers to identify their app; optional but
  // recommended, and harmless to send.
  extraHeaders: {
    "HTTP-Referer": process.env.FRONTEND_URL || "https://ai-code-studio-front.vercel.app",
    "X-Title": "AI Code Studio"
  }
});

export const cerebrasProvider = createOpenAICompatProvider({
  id: "cerebras",
  prefix: "cerebras:",
  baseUrl: "https://api.cerebras.ai/v1"
});

export const mistralProvider = createOpenAICompatProvider({
  id: "mistral",
  prefix: "mistral:",
  baseUrl: "https://api.mistral.ai/v1"
});

export const OPENAI_COMPAT_PROVIDERS = [groqProvider, openrouterProvider, cerebrasProvider, mistralProvider];

/** Given a model id (e.g. "groq:llama-3.3-70b-versatile"), returns the
 * matching provider object, or null if it's a Gemini/Ollama model id
 * (those are routed separately in routes/api.js). */
export function getProviderForModel(modelId) {
  return OPENAI_COMPAT_PROVIDERS.find((p) => modelId?.startsWith(p.prefix)) || null;
}

/** Env var name a given provider's API key is read from, e.g. "groq" ->
 * "GROQ_API_KEY". Matches the naming used in .env.example. */
export function envKeyName(providerId) {
  return `${providerId.toUpperCase()}_API_KEY`;
}
