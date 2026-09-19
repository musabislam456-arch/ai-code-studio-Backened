import path from "node:path";
import fs from "node:fs";
import { buildFallbackOrder } from "../config/models.js";
import { listTree, readFile, writeFile, deleteFile } from "./files.js";
import { runCommandBounded } from "./terminal.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_OUTPUT_TOKENS = 8192;
export const MAX_TOOL_TURNS = 14;
export const COMMAND_TIMEOUT_MS = 25000;

export const FUNCTION_DECLARATIONS = [
  {
    name: "read_file",
    description: "Read the full text content of one file in the workspace, given its path relative to the workspace root.",
    parameters: { type: "OBJECT", properties: { path: { type: "STRING", description: "Relative file path, e.g. src/App.jsx" } }, required: ["path"] }
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
    parameters: { type: "OBJECT", properties: { path: { type: "STRING", description: "Sub-folder to list; omit or leave empty for the workspace root" } } }
  },
  {
    name: "delete_file",
    description: "Delete a file or folder (recursively) from the workspace.",
    parameters: { type: "OBJECT", properties: { path: { type: "STRING", description: "Relative file or folder path to delete" } }, required: ["path"] }
  },
  {
    name: "run_command",
    description: `Run a shell command inside the workspace directory (e.g. "npm install", "npm run build", "ls -la") and get back stdout/stderr/exit code. Times out after ${COMMAND_TIMEOUT_MS / 1000} seconds — do NOT use this for long-running dev servers or anything that waits for input.`,
    parameters: { type: "OBJECT", properties: { command: { type: "STRING" } }, required: ["command"] }
  },
  {
    name: "github_status",
    description: "Check whether this project is already connected to a GitHub repository and return its URL.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "github_create_repo",
    description: "Create a GitHub repository for this project, connect it as origin, make an initial commit, and push the entire workspace. Use private=true unless the user explicitly asks for public.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "GitHub repository name" },
        private: { type: "BOOLEAN", description: "true for private, false for public" },
        description: { type: "STRING", description: "Optional repository description" }
      },
      required: ["name"]
    }
  },
  {
    name: "github_unlink",
    description: "Disconnect the current project's local Git repository from its origin remote without deleting the GitHub repository.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "git_commit",
    description: "Stage all current workspace changes and create a Git commit with the supplied message.",
    parameters: { type: "OBJECT", properties: { message: { type: "STRING" } }, required: ["message"] }
  },
  {
    name: "git_push",
    description: "Push the current project's commits to its connected GitHub origin remote on main.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "git_pull",
    description: "Pull the latest commits from the connected GitHub origin remote on main.",
    parameters: { type: "OBJECT", properties: {} }
  }
];

const TOOLS = [
  { function_declarations: FUNCTION_DECLARATIONS.filter((x) => !x.name.startsWith("github_") && !x.name.startsWith("git_")) },
  { google_search: {} }
];

function emitGrounding(data, onStep) {
  const gm = data?.candidates?.[0]?.groundingMetadata;
  for (const query of gm?.webSearchQueries || []) onStep({ type: "web_search", query });
  const sources = (gm?.groundingChunks || []).map(c => c?.web ? { title: c.web.title || "", uri: c.web.uri || "" } : null).filter(Boolean);
  if (sources.length) onStep({ type: "web_sources", sources });
}

export function safePath(root, relPath) {
  const base = path.resolve(root);
  const full = path.resolve(root, String(relPath || ""));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Path is outside the workspace.");
  return full;
}

export function makeToolExecutor(workspaceDir, onStep) {
  return async function execTool(name, args = {}) {
    switch (name) {
      case "read_file": return { content: readFile(workspaceDir, args.path) };
      case "write_file": writeFile(workspaceDir, args.path, args.content ?? ""); return { ok: true, path: args.path, bytes: (args.content ?? "").length };
      case "list_files": {
        const dir = args.path ? safePath(workspaceDir, args.path) : workspaceDir;
        fs.mkdirSync(dir, { recursive: true });
        return { tree: listTree(dir, workspaceDir) };
      }
      case "delete_file": deleteFile(workspaceDir, args.path); return { ok: true, path: args.path };
      case "run_command": return await runCommandBounded(args.command, workspaceDir, COMMAND_TIMEOUT_MS, (stream, data) => onStep({ type: "command_output", tool: "run_command", stream, data }));
      default: return { error: `Unknown tool: ${name}` };
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
      // Gemini 3.x no longer needs/should not receive legacy temperature.
      // Keeping this config minimal avoids 400s on newer models.
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
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

function isRetryableModelError(err) {
  // 404/400 often means an unavailable/invalid model or request shape;
  // 5xx means temporary provider trouble. 429 is quota/rate limiting and
  // should NOT hammer every fallback immediately with the same large prompt.
  return [400, 404, 408, 409, 500, 502, 503, 504].includes(Number(err?.status));
}

export async function runAgentLoop({ apiKey, modelId, workspaceDir, messages, systemInstruction, onStep }) {
  const order = buildFallbackOrder(modelId);
  const execTool = makeToolExecutor(workspaceDir, onStep);
  let contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  let data = null;
  let chosenModel = null;
  let lastErr = null;

  for (const candidate of order) {
    try {
      onStep({ type: "status", text: candidate === modelId ? "Soch raha hoon..." : `${candidate} try kar raha hoon (fallback)...` });
      data = await callModelOnce({ apiKey, modelId: candidate, contents, systemInstruction });
      emitGrounding(data, onStep);
      chosenModel = candidate;
      break;
    } catch (err) {
      lastErr = err;
      const short = String(err.message || "").replace(/\s+/g, " ").slice(0, 240);
      onStep({ type: "status", text: `${candidate} fail hua (${err.status ?? "network error"}) — ${short}` });
      if (!isRetryableModelError(err)) break;
    }
  }

  if (!chosenModel) {
    if (lastErr?.status === 429) {
      throw new Error(`Gemini quota/rate limit (429) hit ho gayi. Aapka API tester chhoti request par kaam kar sakta hai, lekin agent request mein tools + conversation history zyada input tokens consume kar rahe hain. 429 par sab models ko immediately hammer nahi kiya ja raha. Thori der baad retry karein ya Ollama model select karein.`);
    }
    throw new Error(`Gemini agent start nahi ho saka. Aakhri error (${order[0]}): ${String(lastErr?.message || "unknown error").slice(0, 700)}`);
  }

  let turns = 0;
  while (true) {
    const candidate = data?.candidates?.[0];
    if (!candidate) throw new Error(`Model se khaali response mila (no candidates). Raw: ${JSON.stringify(data).slice(0, 400)}`);

    const finishReason = candidate.finishReason;
    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join("");

    if (functionCalls.length === 0) {
      if (!textParts && finishReason && finishReason !== "STOP") {
        const reasonMap = { MAX_TOKENS: "jawab bohot lamba ho gaya aur token limit khatam ho gayi", SAFETY: "safety filter lag gaya", RECITATION: "recitation filter lag gaya", OTHER: "namaloom wajah se model ne jawab nahi diya" };
        throw new Error(`Model ka jawab incomplete/blocked aaya — ${reasonMap[finishReason] || `finishReason: ${finishReason}`}.`);
      }
      return { text: textParts || "(khaali jawab mila)", usedModel: chosenModel };
    }

    turns += 1;
    if (turns > MAX_TOOL_TURNS) return { text: textParts || "Bohot zyada steps ho gaye — ruk raha hoon taake infinite loop na bane. Jo ab tak ban chuka hai wo workspace mein maujood hai.", usedModel: chosenModel };

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      onStep({ type: "tool_call", tool: fc.name, args: fc.args || {} });
      let result; let ok = true;
      try { result = await execTool(fc.name, fc.args || {}); }
      catch (err) { ok = false; result = { error: err.message }; }
      onStep({ type: "tool_result", tool: fc.name, ok, args: fc.args || {}, result });
      // Gemini 3.x requires each function response to match the call id/name.
      responseParts.push({ functionResponse: { name: fc.name, id: fc.id, response: result } });
    }

    // GenerateContent expects the function results as a user turn.
    contents.push({ role: "user", parts: responseParts });
    onStep({ type: "status", text: "Agla step soch raha hoon..." });
    try {
      data = await callModelOnce({ apiKey, modelId: chosenModel, contents, systemInstruction });
    } catch (err) {
      if (err.status === 429) throw new Error("Gemini quota/rate limit (429) tool-call ke baad hit ho gayi. Conversation + tool results ko dobara input mein bhejne se token usage barhta hai. Ollama fallback ya thori der baad retry karein.");
      throw new Error(`Gemini ${chosenModel} tool step fail hua (${err.status ?? "network error"}): ${String(err.message).slice(0, 700)}`);
    }
    emitGrounding(data, onStep);
  }
}
