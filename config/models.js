/**
 * Gemini model catalog + auto-mode selection + fallback chain.
 * Keep this file updated as Google ships new models — it is the
 * single source of truth the whole app reads from.
 *
 * Last checked: Sept 2026.
 */

export const MODELS = {
  pro: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", tier: "pro", contextIn: 1000000, notes: "Most capable reasoning model." },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Stable)", tier: "pro", contextIn: 1000000, notes: "Stable fallback, GA until Oct 2026." },
    { id: "gemini-pro-latest", label: "Gemini Pro (Latest alias)", tier: "pro", contextIn: 1000000, notes: "Always points at Google's current best Pro model." }
  ],
  flash: [
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (GA)", tier: "flash", contextIn: 1000000, notes: "Best agentic/coding performance in the Flash tier." },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", tier: "flash", contextIn: 1000000, notes: "Docs-default preview model." },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Stable)", tier: "flash", contextIn: 1000000, notes: "Stable fallback." },
    { id: "gemini-flash-latest", label: "Gemini Flash (Latest alias)", tier: "flash", contextIn: 1000000, notes: "Always points at Google's current best Flash model." }
  ],
  flashLite: [
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (Stable)", tier: "flash-lite", contextIn: 1000000, notes: "Cheapest/fastest, good for small edits & quick answers." },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (Stable)", tier: "flash-lite", contextIn: 1000000, notes: "Older stable fallback." }
  ]
};

export const ALL_MODELS = [...MODELS.pro, ...MODELS.flash, ...MODELS.flashLite];

export function pickModelForTask(taskHint = {}) {
  const { needsDeepReasoning, isQuickEdit, inputTokensEstimate = 0 } = taskHint;

  if (isQuickEdit && inputTokensEstimate < 20000) {
    return "gemini-3.1-flash-lite";
  }
  if (needsDeepReasoning) {
    return "gemini-3.1-pro-preview";
  }
  return "gemini-3.5-flash";
}

export const FALLBACK_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];

export function buildFallbackOrder(preferredModelId) {
  const rest = FALLBACK_CHAIN.filter((m) => m !== preferredModelId);
  return [preferredModelId, ...rest];
}
