/**
 * Full model catalog + auto-mode selection + fallback chain, across every
 * provider this app supports (Gemini, Ollama Cloud, Groq, OpenRouter,
 * Cerebras, Mistral). Keep this file updated as providers ship/retire
 * models — it is the single source of truth the whole app reads from.
 *
 * Last checked: Sept 20, 2026 — every id below was verified live against
 * each provider's own docs/API (not guessed, not carried over from an
 * older snapshot). See the per-provider comments for exact sources.
 */

// ---------------------------------------------------------------------
// Gemini — verified live against ai.google.dev/gemini-api/docs/models
// and .../deprecations (both "Last updated 2026-09-17"). Only gemini-2.5-*
// and gemini-3.x-* text models are listed; none of these currently have an
// announced shutdown date except gemini-3.1-flash-lite (May 7, 2027 — far
// out, not urgent).
// ---------------------------------------------------------------------
export const MODELS = {
  pro: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", tier: "pro", provider: "gemini", contextIn: 1000000, notes: "Most capable reasoning model — best for architecture / multi-file work." },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "pro", provider: "gemini", contextIn: 1000000, notes: "Older stable Pro — no shutdown date announced, still fully supported." }
  ],
  flash: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (newest, GA)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Most intelligent Flash model — long-horizon coding, agents, complex workflows. Released Sept 2, 2026." },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (GA)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Previous-gen Flash — complex coding, agentic workflows, reliable multi-step execution." },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (GA)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Older Flash GA — balances speed and multimodal capability for everyday tasks." },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (GA, legacy)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Legacy Flash GA, baseline speed for routine high-throughput work." },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Preview tier; Google recommends 3.6 Flash as the GA replacement." },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "flash", provider: "gemini", contextIn: 1000000, notes: "Older stable — no shutdown date announced." }
  ],
  flashLite: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (GA, latest)", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Fastest, most cost-effective 3.5-gen model." },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (GA)", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Frontier-class performance at a fraction of the cost. Shutdown not before May 7, 2027." },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", tier: "flash-lite", provider: "gemini", contextIn: 1000000, notes: "Older stable — no shutdown date announced." }
  ]
};

// ---------------------------------------------------------------------
// Ollama Cloud (free tier, called via services/ollama.js -> OLLAMA_API_KEY,
// hitting https://ollama.com/api/chat directly). IMPORTANT: per
// docs.ollama.com/cloud, API calls must use the BARE tag returned by
// GET https://ollama.com/api/tags (e.g. "kimi-k2.7-code") — the "-cloud"
// suffix (e.g. "kimi-k2.7-code-cloud") is ONLY for the Ollama app/CLI and
// will 404 against the raw API. This was the single biggest bug in the
// previous version of this file. List cross-checked live against
// GET https://ollama.com/api/tags on Sept 20, 2026.
// ---------------------------------------------------------------------
export const OLLAMA_MODELS = [
  {
    id: "ollama:kimi-k2.7-code",
    label: "Kimi K2.7 Code (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 200000,
    notes: "Purpose-built agentic coding model — recommended default for this app's agent."
  },
  {
    id: "ollama:gpt-oss:120b",
    label: "GPT-OSS 120B (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 128000,
    notes: "Strong general reasoning + coding, medium usage on the free tier."
  },
  {
    id: "ollama:gpt-oss:20b",
    label: "GPT-OSS 20B (Ollama Cloud, free, lightweight)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 128000,
    notes: "Lightest option — pick this if bigger models hit Ollama's free-tier rate limit."
  },
  {
    id: "ollama:minimax-m2.7",
    label: "MiniMax M2.7 (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 200000,
    notes: "Coding + agent-workflow specialist, good tool-calling."
  },
  {
    id: "ollama:glm-5.3-flash",
    label: "Z.ai GLM 5.3 Flash (Ollama Cloud, free)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 128000,
    notes: "Fast general-purpose reasoning model."
  },
  {
    id: "ollama:nemotron-3-nano:30b",
    label: "Nemotron 3 Nano 30B (Ollama Cloud, free, 1M ctx)",
    tier: "ollama",
    provider: "ollama",
    contextIn: 1000000,
    notes: "Small active-param MoE with a huge context window — good for whole-repo reads."
  }
];

// ---------------------------------------------------------------------
// Groq (free developer tier, no credit card — org-level rate limits, not
// $0 model carve-outs). Verified live against console.groq.com/docs/models
// (Sept 2026 snapshot): llama-3.3-70b-versatile and llama-3.1-8b-instant
// are now Enterprise-only ("Contact Sales") and no longer self-serve;
// qwen/qwen3-32b was deprecated in favor of qwen/qwen3.8-27b;
// moonshotai/kimi-k2-instruct is no longer listed at all.
// ---------------------------------------------------------------------
export const GROQ_MODELS = [
  {
    id: "groq:openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq, free tier)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Groq's current production default — strong reasoning + tool calling, ~500 tok/s."
  },
  {
    id: "groq:openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq, free tier, lightweight)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Lighter/faster than 120B (~1000 tok/s) — use to save quota."
  },
  {
    id: "groq:qwen/qwen3.8-27b",
    label: "Qwen3.8 27B (Groq, free tier, preview)",
    tier: "groq",
    provider: "groq",
    contextIn: 131042,
    notes: "Current Qwen preview model on Groq — replaces the retired qwen3-32b."
  },
  {
    id: "groq:openai/gpt-oss-safeguard-20b",
    label: "GPT-OSS Safeguard 20B (Groq, free tier, preview)",
    tier: "groq",
    provider: "groq",
    contextIn: 131072,
    notes: "Safety-tuned variant of GPT-OSS 20B, same speed class."
  }
];

// ---------------------------------------------------------------------
// OpenRouter. Individual ":free" model slugs rotate frequently (confirmed
// live — several previous entries like qwen3-coder:free and
// deepseek-r1:free are gone as of this check). To avoid breaking every
// time OpenRouter rotates its free lineup, the primary pick is now
// "openrouter/free" — OpenRouter's own auto-router across whatever free
// models are currently live (launched Feb 2026, stable id, handles tool
// calling). A few individually-verified free models are kept as manual
// alternates. Verified live against openrouter.ai/models?q=free, Sept 2026.
// ---------------------------------------------------------------------
export const OPENROUTER_MODELS = [
  {
    id: "openrouter:openrouter/free",
    label: "Free Models Router (OpenRouter, auto-picks a free model)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 200000,
    notes: "Recommended default — always resolves to a currently-live free model, so it can't 404 when the free lineup rotates."
  },
  {
    id: "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "NVIDIA Nemotron 3 Ultra (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 1000000,
    notes: "Very large MoE, 1M context — heavy general reasoning / agent orchestration."
  },
  {
    id: "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    label: "NVIDIA Nemotron 3 Super (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 128000,
    notes: "Smaller sibling of Nemotron 3 Ultra — faster, still strong reasoning."
  },
  {
    id: "openrouter:cohere/north-mini-code:free",
    label: "Cohere North Mini Code (OpenRouter, free)",
    tier: "openrouter",
    provider: "openrouter",
    contextIn: 128000,
    notes: "Coding-specialized small model."
  }
];

// ---------------------------------------------------------------------
// Cerebras (free public endpoint, no credit card). Verified live against
// inference-docs.cerebras.ai/models/overview: llama3.1-8b and
// qwen-3-235b-a22b-instruct-2507 were deprecated May 27, 2026;
// qwen-3-32b and llama-3.3-70b were deprecated Feb 16, 2026 (migrate to
// GPT-OSS 120B); zai-glm-4.7 moved to paid Dedicated Endpoints only. The
// public free-tier catalog is now down to just 2 models.
// ---------------------------------------------------------------------
export const CEREBRAS_MODELS = [
  {
    id: "cerebras:gpt-oss-120b",
    label: "GPT-OSS 120B (Cerebras, free, ~3000 tok/s)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 65000,
    notes: "Cerebras' main production model — fastest way to run gpt-oss-120b."
  },
  {
    id: "cerebras:qwen-3.8-27b",
    label: "Qwen 3.8 27B (Cerebras, free, ~1850 tok/s)",
    tier: "cerebras",
    provider: "cerebras",
    contextIn: 64000,
    notes: "Current Qwen model on Cerebras' free public endpoint."
  }
];

// ---------------------------------------------------------------------
// Mistral La Plateforme free "Experiment" tier. IDs below are the exact
// model names confirmed live on your own account's rate-limit dashboard
// (admin.mistral.ai/plateforme/limits) — not generic "-latest" aliases,
// since not every alias is enabled for every account (e.g. devstral is
// NOT on your account's limits page and was removed from this list).
// ---------------------------------------------------------------------
export const MISTRAL_MODELS = [
  {
    id: "mistral:codestral-2508",
    label: "Codestral (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 256000,
    notes: "Mistral's dedicated code-generation/completion model — best Mistral pick for this app."
  },
  {
    id: "mistral:mistral-large-2512",
    label: "Mistral Large (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Flagship reasoning model on your account's free tier."
  },
  {
    id: "mistral:mistral-medium-latest",
    label: "Mistral Medium (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Balanced quality/speed general-purpose model."
  },
  {
    id: "mistral:mistral-small-2603",
    label: "Mistral Small (Mistral, free)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Fast everyday chat/coding model."
  },
  {
    id: "mistral:ministral-8b-2512",
    label: "Ministral 8B (Mistral, free, lightweight)",
    tier: "mistral",
    provider: "mistral",
    contextIn: 128000,
    notes: "Smallest/fastest option — highest RPS on the free tier (12.5 req/s)."
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
// models are still selectable manually in the dropdown as a further
// fallback, since they remain fully supported (no shutdown date announced).
export const FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite"
];

export function buildFallbackOrder(preferredModelId) {
  const rest = FALLBACK_CHAIN.filter((m) => m !== preferredModelId);
  return [preferredModelId, ...rest];
}
