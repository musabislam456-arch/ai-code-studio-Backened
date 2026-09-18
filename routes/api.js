import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { ALL_MODELS, pickModelForTask } from "../config/models.js";
import { callGemini } from "../services/gemini.js";
import {
  initRepo, commitAll, push, pull, addRemote, createGithubRepo, status, log
} from "../services/git.js";
import {
  listTree, readFile, writeFile, deleteFile, extractZip, createZip
} from "../services/files.js";

const router = express.Router();
const upload = multer({ dest: "/tmp/uploads" });

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || path.join(process.cwd(), "workspaces");
fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

function workspacePath(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9-_]/g, "");
  return path.join(WORKSPACES_ROOT, safe);
}

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

router.get("/workspace/:name/tree", (req, res) => {
  const dir = workspacePath(req.params.name);
  fs.mkdirSync(dir, { recursive: true });
  res.json({ tree: listTree(dir) });
});

router.get("/workspace/:name/file", (req, res) => {
  const dir = workspacePath(req.params.name);
  try {
    res.json({ content: readFile(dir, req.query.path) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/workspace/:name/file", (req, res) => {
  const dir = workspacePath(req.params.name);
  const { path: relPath, content } = req.body;
  res.json(writeFile(dir, relPath, content));
});

router.delete("/workspace/:name/file", (req, res) => {
  const dir = workspacePath(req.params.name);
  res.json(deleteFile(dir, req.query.path));
});

router.post("/workspace/:name/upload-zip", upload.single("file"), (req, res) => {
  const dir = workspacePath(req.params.name);
  fs.mkdirSync(dir, { recursive: true });
  res.json(extractZip(req.file.path, dir));
});

router.get("/workspace/:name/download-zip", async (req, res) => {
  const dir = workspacePath(req.params.name);
  const outZip = path.join("/tmp", `${req.params.name}-${Date.now()}.zip`);
  await createZip(dir, outZip);
  res.download(outZip);
});

router.post("/workspace/:name/git/init", async (req, res) => {
  res.json(await initRepo(workspacePath(req.params.name)));
});

router.post("/workspace/:name/git/commit", async (req, res) => {
  res.json(await commitAll(workspacePath(req.params.name), req.body.message));
});

router.post("/workspace/:name/git/push", async (req, res) => {
  res.json(await push(workspacePath(req.params.name), req.body.remote, req.body.branch));
});

router.post("/workspace/:name/git/pull", async (req, res) => {
  res.json(await pull(workspacePath(req.params.name), req.body.remote, req.body.branch));
});

router.post("/workspace/:name/git/status", async (req, res) => {
  res.json(await status(workspacePath(req.params.name)));
});

router.post("/workspace/:name/git/log", async (req, res) => {
  res.json(await log(workspacePath(req.params.name)));
});

router.post("/workspace/:name/github/create-repo", async (req, res) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(400).json({ error: "GITHUB_TOKEN not set on server." });
    const { repoName, description, isPrivate } = req.body;
    const result = await createGithubRepo({ token, name: repoName, description, isPrivate });
    await addRemote(workspacePath(req.params.name), result.authedCloneUrl);
    res.json({ htmlUrl: result.htmlUrl, cloneUrl: result.cloneUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
