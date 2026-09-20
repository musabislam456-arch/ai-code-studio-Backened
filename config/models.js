/**
 * Gemini model catalog + auto-mode selection + fallback chain.
 * Keep this file updated as Google ships new models — it is the
 * single source of truth the whole app reads from.
 *
 * Last checked: Sept 18, 2026 — verified live against
 * ai.google.dev/gemini-api/docs/models and .../deprecations.
 * (Previous version of this file was missing Gemini 3.7 Flash and
 * the newly-released Gemini 3.8 Flash — added below.)
 */

export const MODELS = {
  pro: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", tier: "pro", provider: "gemini", contextIn: 1000000, notes: "Most capable reasoning model — best for architecture / multi-file work." },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (retiring Oct 16, 2026)", tier: "pro", provider: "gemini", contextIn: 1000000, notes: "Older stable Pro — Google is shutting this down soon, prefer 3.1 Pro." }
  ],
  flash: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (GA, newest)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Most intelligent Flash model — long-horizon coding, agents, complex workflows." },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (GA)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Previous-gen Flash — complex coding, agentic workflows, reliable multi-step execution." },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (GA)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Older Flash GA — balances speed and multimodal capability for everyday tasks." },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (GA, legacy)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Legacy Flash GA, baseline speed for routine high-throughput work." },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Preview tier, ahead of 2.5 but behind the 3.x GA line." },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (retiring Oct 16, 2026)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
  ],
  flashLite: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (GA, latest)", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Fastest, most cost-effective 3.5-gen model." },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (GA)", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Frontier-class performance at a fraction of the cost." },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (retiring Oct 16, 2026)", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
  ]
};

// Ollama Cloud models (free tier, called via services/ollama.js using
// OLLAMA_API_KEY). The "ollama:" prefix on the id is how routes/api.js and
// services/agent.js tell these apart from Gemini model ids and route the
// request to the right provider — the part after the first colon is the
// exact tag Ollama expects (it may itself contain a colon, e.g. "480b-cloud").
// Verified live against ollama.com/search?c=cloud and docs.ollama.com/cloud.
export const OLLAMA_MODELS = [
  {
    id: "ollama:qwen3-coder:480b-cloud",
    label: "Qwen3 Coder 480B (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 262000,
    notes: "Best free agentic coding model on Ollama — full tool-calling support, recommended default for the agent."
  },
  {
    id: "ollama:gpt-oss:120b-cloud",
    label: "GPT-OSS 120B (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 128000,
    notes: "Strong general reasoning + coding, medium free-tier usage."
  },
  {
    id: "ollama:gpt-oss:20b-cloud",
    label: "GPT-OSS 20B (Ollama Cloud, free, lightweight)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 128000,
    notes: "Lightest free-tier model — pick this if larger models hit Ollama's free-tier rate limit on big tool-heavy requests."
  }
];

// Groq (free tier, called via services/providers.js -> openaiCompat using
// GROQ_API_KEY). Free tier = no cost, just rate-limited (~30 RPM, ~1K
// req/day, model-specific TPD caps) — no credit card needed.
// Verified live against console.groq.com/docs/models, Sept 2026.
export const GROQ_MODELS = [
  {
    id: "groq:llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile (Groq, free)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Groq's general-purpose default — strong reasoning + coding, very fast (LPU hardware)."
  },
  {
    id: "groq:openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq, free)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "OpenAI's open-weight 120B reasoning model, built-in tool calling — good agentic coding fallback."
  },
  {
    id: "groq:openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq, free, lightweight)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Lighter/faster than 120B, higher free-tier daily cap — pick this if 120B hits rate limits."
  },
  {
    id: "groq:qwen/qwen3-32b",
    label: "Qwen3 32B (Groq, free, preview)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Preview model — decent coding performance, may be discontinued without notice per Groq's preview policy."
  },
  {
    id: "groq:moonshotai/kimi-k2-instruct",
    label: "Kimi K2 Instruct (Groq, free, preview)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Strong agentic/tool-use model, preview tier on Groq."
  },
  {
    id: "groq:llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Groq, free)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Smallest/fastest — use for quick edits when you want to save quota on the bigger models."
  }
];

// OpenRouter free models (":free" suffix, $0/token). New accounts get 20
// RPM / 50 req/day; once you've ever bought $10 of credit that daily cap
// rises to 1,000/day. Free-model lineup rotates fairly often — cross-check
// against openrouter.ai/models?pricing=free if one of these 404s.
// Verified live Sept 2026.
export const OPENROUTER_MODELS = [
  {
    id: "openrouter:qwen/qwen3-coder:free",
    label: "Qwen3 Coder (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 1000000,
    notes: "Purpose-built agentic coding model, large context — best OpenRouter free pick for this app."
  },
  {
    id: "openrouter:deepseek/deepseek-r1:free",
    label: "DeepSeek R1 (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 128000,
    notes: "Strong reasoning model, good for deep debugging / architecture questions."
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3.1:free",
    label: "DeepSeek Chat V3.1 (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 128000,
    notes: "Faster non-reasoning DeepSeek variant for everyday chat/coding."
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B Instruct (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 128000,
    notes: "Reliable general-purpose free model on OpenRouter."
  },
  {
    id: "openrouter:openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 131000,
    notes: "Same open-weight model as on Groq/Cerebras, routed through OpenRouter instead."
  },
  {
    id: "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "NVIDIA Nemotron 3 Ultra (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 1000000,
    notes: "Very large MoE model, 1M context — heavy general reasoning / agent orchestration."
  }
];

// Cerebras (free tier, no credit card). Free allowance is a daily-token
// budget on Cerebras' LPU hardware (very fast tokens/sec, weaker coding
// quality than Gemini — treat as an emergency fallback, not primary).
// Verified live against inference-docs.cerebras.ai/models/overview, Sept 2026.
export const CEREBRAS_MODELS = [
  {
    id: "cerebras:gpt-oss-120b",
    label: "GPT-OSS 120B (Cerebras, free)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 131000,
    notes: "Cerebras' main production reasoning model — fastest way to run gpt-oss-120b."
  },
  {
    id: "cerebras:qwen-3-235b-a22b-instruct-2507",
    label: "Qwen 3 235B Instruct (Cerebras, free, preview)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 128000,
    notes: "Large MoE model, preview tier — good general coding quality."
  },
  {
    id: "cerebras:zai-glm-4.7",
    label: "Z.ai GLM 4.7 (Cerebras, free, preview)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 128000,
    notes: "Cerebras' default preview reasoning model."
  },
  {
    id: "cerebras:llama3.1-8b",
    label: "Llama 3.1 8B (Cerebras, free, lightweight)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 128000,
    notes: "Smallest/fastest Cerebras option — scheduled for deprecation by Cerebras, check availability."
  }
];

// Mistral La Plateforme "Experiment" (free) tier — rate-limited (~1 req/s),
// requires enabling the free/Experiment plan in the Mistral console (data
// may be used for training on this tier). No credit card required.
// Verified live against docs.mistral.ai, Sept 2026.
export const MISTRAL_MODELS = [
  {
    id: "mistral:devstral-small-latest",
    label: "Devstral Small (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Mistral's dedicated agentic coding model — best Mistral pick for this app."
  },
  {
    id: "mistral:codestral-latest",
    label: "Codestral (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 256000,
    notes: "Code-completion/generation specialist model."
  },
  {
    id: "mistral:mistral-small-latest",
    label: "Mistral Small (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "General-purpose chat/reasoning model on the free Experiment tier."
  },
  {
    id: "mistral:open-mistral-nemo",
    label: "Mistral Nemo (Mistral, free, open-weight)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Open-weight 12B model, lighter/faster option."
  }
];

export const ALL_MODELS = [
  ...MODELS.pro, ...MODELS.flash, ...MODELS.flashLite,
  ...OLLAMA_MODELS, ...GROQ_MODELS, ...OPENROUTER_MODELS, ...CEREBRAS_MODELS, ...MISTRAL_MODELS
];

export function pickModelForTask(taskHint = {}) {
  const { needsDeepReasoning, isQuickEdit, inputTokensEstimate = 0 } = taskHint;

  if (isQuickEdit && inputTokensEstimate < 20000) {
    return "gemini-3.5-flash-lite";
  }
  if (needsDeepReasoning) {
    return "gemini-3.1-pro-preview";
  }
  return "gemini-3.8-flash";
}

// Only 3.x-series models are in the automatic fallback chain. The 2.5-series
// models are still selectable manually in the dropdown, but Google has
// started blocking some of them for newer API keys/accounts ("no longer
// available to new users") ahead of their Oct 16, 2026 retirement, so they
// are not worth burning fallback attempts on automatically.
export const FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

export function buildFallbackOrder(preferredModelId) {
  const rest = FALLBACK_CHAIN.filter((m) => m !== preferredModelId);
  return [preferredModelId, ...rest];
}
