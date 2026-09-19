import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { ALL_MODELS, pickModelForTask } from "../config/models.js";
import { callGemini } from "../services/gemini.js";
import { runAgentLoop } from "../services/agent.js";
import { callOllamaChat, runOllamaAgentLoop } from "../services/ollama.js";
import { listProjects, getProject, createProject, renameProject, deleteProject, touchProject } from "../services/db.js";
import {
  initRepo, commitAll, push, pull, addRemote, unlinkRemote, getRemoteInfo, createGithubRepoAndPush, status, log
} from "../services/git.js";
import {
  listTree, readFile, writeFile, deleteFile, extractZip, createZip
} from "../services/files.js";

const router = express.Router();
const upload = multer({ dest: "/tmp/uploads" });

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || path.join(process.cwd(), "workspaces");
fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

function workspacePath(req, name) {
  const projectPart = String(name || "my-project").replace(/[^a-zA-Z0-9_-]/g, "");
  const full = req.user?.isLegacy
    ? path.resolve(WORKSPACES_ROOT, projectPart)
    : path.resolve(WORKSPACES_ROOT, String(req.user?.id || "").replace(/[^a-zA-Z0-9_-]/g, ""), projectPart);
  if (!full.startsWith(path.resolve(WORKSPACES_ROOT) + path.sep)) throw new Error("Invalid workspace.");
  fs.mkdirSync(full, { recursive: true });
  return full;
}

async function ensureProject(req, res, projectId) {
  if (req.user?.isLegacy) return true;
  const project = await getProject(req.user.id, projectId);
  if (!project) { res.status(404).json({ error: "Project not found." }); return false; }
  return true;
}

router.get("/projects", async (req,res) => {
  try {
    if (req.user?.isLegacy) return res.json({ projects: [{ id:"my-project", name:"my-project" }] });
    res.json({ projects: await listProjects(req.user.id) });
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post("/projects", async (req,res) => {
  try {
    if (req.user?.isLegacy) return res.status(400).json({error:"Sign in to create saved projects."});
    const project=await createProject(req.user.id, req.body?.name);
    fs.mkdirSync(workspacePath(req,project.id),{recursive:true});
    res.json({project});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.patch("/projects/:id", async (req,res) => {
  try {
    if (req.user?.isLegacy) return res.status(400).json({error:"Sign in to rename saved projects."});
    const project=await renameProject(req.user.id,req.params.id,req.body?.name);
    if(!project) return res.status(404).json({error:"Project not found."});
    res.json({project});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.delete("/projects/:id", async (req,res) => {
  try {
    if (req.user?.isLegacy) return res.status(400).json({error:"Sign in to delete saved projects."});
    if(!(await getProject(req.user.id,req.params.id))) return res.status(404).json({error:"Project not found."});
    const deleted=await deleteProject(req.user.id,req.params.id);
    fs.rmSync(workspacePath(req,req.params.id),{recursive:true,force:true});
    res.json({ok:deleted});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get("/models", (req, res) => {
  res.json({ models: ALL_MODELS });
});

router.post("/models/auto-pick", (req, res) => {
  const model = pickModelForTask(req.body || {});
  res.json({ model });
});

router.post("/chat", async (req, res) => {
  try {
    const { workspace, modelId, messages, systemInstruction } = req.body;
    const isOllama = modelId?.startsWith("ollama:");

    if (isOllama) {
      const apiKey = process.env.OLLAMA_API_KEY;
      if (!apiKey) return res.status(400).json({ error: "OLLAMA_API_KEY not set on server." });
      const chatMessages = messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const result = await callOllamaChat({ apiKey, modelId, messages: chatMessages, systemInstruction });
      return res.json(result);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "GEMINI_API_KEY not set on server." });

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const result = await callGemini({ apiKey, modelId, contents, systemInstruction });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/agent/chat", async (req, res) => {
  const { workspace, modelId, messages, systemInstruction } = req.body;
  const isOllama = modelId?.startsWith("ollama:");
  const apiKey = isOllama ? process.env.OLLAMA_API_KEY : process.env.GEMINI_API_KEY;

  if (!(await ensureProject(req, res, workspace))) return;
  if (!apiKey) {
    return res.status(400).json({ error: isOllama ? "OLLAMA_API_KEY not set on server." : "GEMINI_API_KEY not set on server." });
  }

  const workspaceDir = workspacePath(req, workspace);
  fs.mkdirSync(workspaceDir, { recursive: true });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => clearInterval(heartbeat));

  try {
    const loop = isOllama ? runOllamaAgentLoop : runAgentLoop;
    const result = await loop({ apiKey, modelId, workspaceDir, messages, systemInstruction, onStep: send });
    send({ type: "final", text: result.text, usedModel: result.usedModel });
  } catch (err) {
    send({ type: "error", message: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

router.get("/workspace/:name/tree", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  const dir = workspacePath(req, req.params.name);
  fs.mkdirSync(dir, { recursive: true });
  res.json({ tree: listTree(dir) });
});

router.get("/workspace/:name/file", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  const dir = workspacePath(req, req.params.name);
  try { res.json({ content: readFile(dir, req.query.path) }); }
  catch (err) { res.status(404).json({ error: err.message }); }
});

router.post("/workspace/:name/file", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  const dir = workspacePath(req, req.params.name);
  const { path: relPath, content } = req.body;
  res.json(writeFile(dir, relPath, content));
});

router.delete("/workspace/:name/file", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  const dir = workspacePath(req, req.params.name);
  res.json(deleteFile(dir, req.query.path));
});

router.post("/workspace/:name/upload-zip", upload.single("file"), async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  const dir = workspacePath(req, req.params.name);
  fs.mkdirSync(dir, { recursive: true });
  res.json(extractZip(req.file.path, dir));
});

router.get("/workspace/:name/download-zip", async (req, res) => {
  const dir = workspacePath(req, req.params.name);
  const outZip = path.join("/tmp", `${req.params.name}-${Date.now()}.zip`);
  await createZip(dir, outZip);
  res.download(outZip);
});

router.post("/workspace/:name/git/init", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await initRepo(workspacePath(req, req.params.name)));
});

router.post("/workspace/:name/git/commit", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await commitAll(workspacePath(req, req.params.name), req.body.message));
});

router.post("/workspace/:name/git/push", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await push(workspacePath(req, req.params.name), req.body.remote, req.body.branch));
});

router.post("/workspace/:name/git/pull", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await pull(workspacePath(req, req.params.name), req.body.remote, req.body.branch));
});

router.post("/workspace/:name/git/status", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await status(workspacePath(req, req.params.name)));
});

router.post("/workspace/:name/git/log", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  res.json(await log(workspacePath(req, req.params.name)));
});

router.get("/workspace/:name/github", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  try {
    await initRepo(workspacePath(req, req.params.name));
    res.json(await getRemoteInfo(workspacePath(req, req.params.name), "origin"));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workspace/:name/github/create-repo", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(400).json({ error: "GITHUB_TOKEN not set on server." });
    const { repoName, description, isPrivate = true } = req.body;
    if (!repoName?.trim()) return res.status(400).json({ error: "Repository name is required." });
    const workspaceDir = workspacePath(req, req.params.name);
    const result = await createGithubRepoAndPush({ token, name: repoName.trim(), description, isPrivate: Boolean(isPrivate), workspaceDir });
    res.json({ htmlUrl: result.htmlUrl, cloneUrl: result.cloneUrl, pushed: result.pushed, branch: result.branch, connected: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/workspace/:name/github/unlink", async (req, res) => {
  if (!(await ensureProject(req,res,req.params.name))) return;
  try {
    res.json(await unlinkRemote(workspacePath(req, req.params.name), "origin"));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
