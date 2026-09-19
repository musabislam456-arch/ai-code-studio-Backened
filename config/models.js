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
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", tier: "pro", contextIn: 1000000, notes: "Most capable reasoning model — best for architecture / multi-file work." },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (retiring Oct 16, 2026)", tier: "pro", contextIn: 1000000, notes: "Older stable Pro — Google is shutting this down soon, prefer 3.1 Pro." }
  ],
  flash: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (GA, newest)", tier: "flash", contextIn: 1000000, notes: "Most intelligent Flash model — long-horizon coding, agents, complex workflows." },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (GA)", tier: "flash", contextIn: 1000000, notes: "Previous-gen Flash — complex coding, agentic workflows, reliable multi-step execution." },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (GA)", tier: "flash", contextIn: 1000000, notes: "Older Flash GA — balances speed and multimodal capability for everyday tasks." },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (GA, legacy)", tier: "flash", contextIn: 1000000, notes: "Legacy Flash GA, baseline speed for routine high-throughput work." },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", tier: "flash", contextIn: 1000000, notes: "Preview tier, ahead of 2.5 but behind the 3.x GA line." },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (retiring Oct 16, 2026)", tier: "flash", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
  ],
  flashLite: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (GA, latest)", tier: "flash-lite", contextIn: 1000000, notes: "Fastest, most cost-effective 3.5-gen model." },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (GA)", tier: "flash-lite", contextIn: 1000000, notes: "Frontier-class performance at a fraction of the cost." },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (retiring Oct 16, 2026)", tier: "flash-lite", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
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

export const ALL_MODELS = [...MODELS.pro, ...MODELS.flash, ...MODELS.flashLite, ...OLLAMA_MODELS];

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
