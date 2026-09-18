/**
 * Gemini model catalog + auto-mode selection + fallback chain.
 * Keep this file updated as Google ships new models — it is the
 * single source of truth the whole app reads from.
 *
 * Last checked: Sept 18, 2026 (verified against ai.google.dev/gemini-api/docs/deprecations
 * and ai.google.dev/gemini-api/docs/changelog).
 */

export const MODELS = {
  pro: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", tier: "pro", contextIn: 1000000, notes: "Most capable reasoning model — best for architecture / multi-file work." },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (retiring Oct 16, 2026)", tier: "pro", contextIn: 1000000, notes: "Older stable Pro — Google is shutting this down soon, prefer 3.1 Pro." }
  ],
  flash: [
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (GA, latest)", tier: "flash", contextIn: 1000000, notes: "Newest Flash GA — better token efficiency and agentic/coding planning." },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (GA)", tier: "flash", contextIn: 1000000, notes: "Previous-gen Flash GA, still solid for most coding tasks." },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", tier: "flash", contextIn: 1000000, notes: "Preview tier, ahead of 2.5 but behind 3.5/3.6 GA." },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (retiring Oct 16, 2026)", tier: "flash", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
  ],
  flashLite: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (GA, latest)", tier: "flash-lite", contextIn: 1000000, notes: "Cheapest/fastest, good for small edits & quick answers." },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (GA)", tier: "flash-lite", contextIn: 1000000, notes: "Previous-gen Flash-Lite GA." },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (retiring Oct 16, 2026)", tier: "flash-lite", contextIn: 1000000, notes: "Older stable — Google is shutting this down soon." }
  ]
};

export const ALL_MODELS = [...MODELS.pro, ...MODELS.flash, ...MODELS.flashLite];

export function pickModelForTask(taskHint = {}) {
  const { needsDeepReasoning, isQuickEdit, inputTokensEstimate = 0 } = taskHint;

  if (isQuickEdit && inputTokensEstimate < 20000) {
    return "gemini-3.5-flash-lite";
  }
  if (needsDeepReasoning) {
    return "gemini-3.1-pro-preview";
  }
  return "gemini-3.6-flash";
}

export const FALLBACK_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];

export function buildFallbackOrder(preferredModelId) {
  const rest = FALLBACK_CHAIN.filter((m) => m !== preferredModelId);
  return [preferredModelId, ...rest];
}
