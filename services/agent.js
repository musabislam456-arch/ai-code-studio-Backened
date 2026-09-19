import path from "node:path";
import fs from "node:fs";
import { buildFallbackOrder } from "../config/models.js";
import { listTree, readFile, writeFile, deleteFile } from "./files.js";
import { runCommandBounded } from "./terminal.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Keep this well under each model's real output limit so we never silently
// hit MAX_TOKENS on a normal-sized answer, but still bounded so a runaway
// generation can't hang the request forever.
const MAX_OUTPUT_TOKENS = 8192;

// Hard cap on how many tool round-trips one agent turn can take, so a
// confused model can't loop forever burning API calls.
const MAX_TOOL_TURNS = 14;

// How long a single run_command call is allowed to run before it's killed.
const COMMAND_TIMEOUT_MS = 25000;

const FUNCTION_DECLARATIONS = [
      {
        name: "read_file",
        description: "Read the full text content of one file in the workspace, given its path relative to the workspace root.",
        parameters: {
          type: "OBJECT",
          properties: { path: { type: "STRING", description: "Relative file path, e.g. src/App.jsx" } },
          required: ["path"]
        }
      },
      {
        name: "write_file",
        description: "Create a new file or overwrite an existing file in the workspace with the given content. Parent folders are created automatically. Always write the COMPLETE file content, not a diff.",
        parameters: {
          type: "OBJECT",
          properties: {
            path: { type: "STRING", description: "Relative file path, e.g. src/components/Foo.jsx" },
            content: { type: "STRING", description: "The full contents to write to the file" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "list_files",
        description: "List files and folders in the workspace as a tree, optionally under a sub-path.",
        parameters: {
          type: "OBJECT",
          properties: { path: { type: "STRING", description: "Sub-folder to list; omit or leave empty for the workspace root" } }
        }
      },
      {
        name: "delete_file",
        description: "Delete a file or folder (recursively) from the workspace.",
        parameters: {
          type: "OBJECT",
          properties: { path: { type: "STRING", description: "Relative file or folder path to delete" } },
          required: ["path"]
        }
      },
      {
        name: "run_command",
        description: `Run a shell command inside the workspace directory (e.g. "npm install", "npm run build", "ls -la") and get back stdout/stderr/exit code. Times out after ${COMMAND_TIMEOUT_MS / 1000} seconds — do NOT use this for long-running dev servers or anything that waits for input.`,
        parameters: {
          type: "OBJECT",
          properties: { command: { type: "STRING" } },
          required: ["command"]
        }
      }
  ];

const TOOLS = [
  { function_declarations: FUNCTION_DECLARATIONS },
  { google_search: {} }
];

function emitGrounding(data, onStep) {
  const gm = data?.candidates?.[0]?.groundingMetadata;
  for (const query of gm?.webSearchQueries || []) onStep({ type: "web_search", query });
  const sources = (gm?.groundingChunks || [])
    .map(c => c?.web ? { title: c.web.title || "", uri: c.web.uri || "" } : null)
    .filter(Boolean);
  if (sources.length) onStep({ type: "web_sources", sources });
}

function safePath(root, relPath) {
  const base = path.resolve(root);
  const full = path.resolve(root, String(relPath || ""));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Path is outside the workspace.");
  return full;
}

function makeToolExecutor(workspaceDir, onStep) {
  return async function execTool(name, args = {}) {
    switch (name) {
      case "read_file":
        return { content: readFile(workspaceDir, args.path) };

      case "write_file":
        writeFile(workspaceDir, args.path, args.content ?? "");
        return { ok: true, path: args.path, bytes: (args.content ?? "").length };

      case "list_files": {
        const dir = args.path ? safePath(workspaceDir, args.path) : workspaceDir;
        fs.mkdirSync(dir, { recursive: true });
        return { tree: listTree(dir, workspaceDir) };
      }

      case "delete_file":
        deleteFile(workspaceDir, args.path);
        return { ok: true, path: args.path };

      case "run_command":
        return await runCommandBounded(args.command, workspaceDir, COMMAND_TIMEOUT_MS, (stream, data) => onStep({ type: "command_output", tool: "run_command", stream, data }));

      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}

async function callModelOnce({ apiKey, modelId, contents, systemInstruction }) {
  const res = await fetch(`${GEMINI_BASE}/models/${modelId}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      tools: TOOLS,
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.7 }
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

/**
 * Runs one full agent turn: calls Gemini, executes any function calls it
 * asks for against the real workspace, feeds the results back, and repeats
 * until the model returns a plain text answer (or a hard limit is hit).
 * `onStep(event)` is called synchronously for every step so the caller can
 * stream them straight to the client (SSE) as they happen.
 */
export async function runAgentLoop({ apiKey, modelId, workspaceDir, messages, systemInstruction, onStep }) {
  const order = buildFallbackOrder(modelId);
  const execTool = makeToolExecutor(workspaceDir, onStep);

  let contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  // First call: try the fallback chain until one model actually answers.
  // Once a model responds, we stick with it for the rest of this turn's
  // tool round-trips (switching mid-conversation would confuse the
  // function-calling context).
  let data = null;
  let chosenModel = null;
  let lastErr = null;

  for (const candidate of order) {
    try {
      if (candidate !== modelId) {
        onStep({ type: "status", text: `${candidate} try kar raha hoon (fallback)...` });
      } else {
        onStep({ type: "status", text: "Soch raha hoon..." });
      }
      data = await callModelOnce({ apiKey, modelId: candidate, contents, systemInstruction });
      emitGrounding(data, onStep);
      chosenModel = candidate;
      break;
    } catch (err) {
      lastErr = err;
      onStep({ type: "status", text: `${candidate} fail hua (${err.status ?? "network error"}), agla try kar raha hoon...` });
    }
  }

  if (!chosenModel) {
    const msg = `Sab models fail ho gaye. Aakhri error (${order[order.length - 1]}): ${lastErr?.message || "unknown error"}`;
    throw new Error(msg);
  }

  let turns = 0;

  while (true) {
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      throw new Error(`Model se khaali response mila (no candidates). Raw: ${JSON.stringify(data).slice(0, 400)}`);
    }

    const finishReason = candidate.finishReason;
    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join("");

    if (functionCalls.length === 0) {
      // No tool calls left — this is (meant to be) the final answer.
      if (!textParts && finishReason && finishReason !== "STOP") {
        // This is exactly the old silent "(no response)" bug: surface WHY
        // instead of showing nothing.
        const reasonMap = {
          MAX_TOKENS: "jawab bohot lamba ho gaya aur token limit khatam ho gayi",
          SAFETY: "safety filter lag gaya",
          RECITATION: "recitation filter lag gaya (copyrighted content jaisa laga)",
          OTHER: "namaloom wajah se model ne jawab nahi diya"
        };
        const reason = reasonMap[finishReason] || `finishReason: ${finishReason}`;
        throw new Error(`Model ka jawab incomplete/blocked aaya — ${reason}.`);
      }
      return { text: textParts || "(khaali jawab mila)", usedModel: chosenModel };
    }

    turns += 1;
    if (turns > MAX_TOOL_TURNS) {
      const fallbackText = textParts || "Bohot zyada steps ho gaye — ruk raha hoon taake infinite loop na bane. Jo ab tak ban chuka hai wo workspace mein maujood hai.";
      return { text: fallbackText, usedModel: chosenModel };
    }

    // Record the model's turn (including its function call requests).
    contents.push({ role: "model", parts });

    const responseParts = [];
    for (const fc of functionCalls) {
      onStep({ type: "tool_call", tool: fc.name, args: fc.args || {} });
      let result;
      let ok = true;
      try {
        result = await execTool(fc.name, fc.args || {});
      } catch (err) {
        ok = false;
        result = { error: err.message };
      }
      onStep({ type: "tool_result", tool: fc.name, ok, args: fc.args || {}, result });
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }

    contents.push({ role: "function", parts: responseParts });

    onStep({ type: "status", text: "Agla step soch raha hoon..." });
    data = await callModelOnce({ apiKey, modelId: chosenModel, contents, systemInstruction });
    emitGrounding(data, onStep);
  }
}
