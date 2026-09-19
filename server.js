import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import apiRouter from "./routes/api.js";
import { runCommandStreaming } from "./services/terminal.js";
import { requireAuth, checkWsToken } from "./middleware/auth.js";

dotenv.config();

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json({ limit: "20mb" }));
app.use("/api", requireAuth, apiRouter);

const WORKSPACES_ROOT = path.resolve(process.env.WORKSPACES_ROOT || path.join(process.cwd(), "workspaces"));
fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

function workspacePath(name) {
  const safe = String(name || "my-project").replace(/[^a-zA-Z0-9-_]/g, "");
  const full = path.resolve(WORKSPACES_ROOT, safe);
  if (!full.startsWith(WORKSPACES_ROOT + path.sep)) throw new Error("Invalid workspace.");
  fs.mkdirSync(full, { recursive: true });
  return full;
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/terminal" });

wss.on("connection", (ws, req) => {
  if (!checkWsToken(req.url)) {
    ws.send(JSON.stringify({ type: "stderr", data: "Unauthorized
" }));
    ws.close();
    return;
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "run") {
      let cwd;
      try { cwd = workspacePath(msg.cwd); }
      catch (err) {
        ws.send(JSON.stringify({ type: "stderr", data: `Invalid workspace: ${err.message}
` }));
        ws.send(JSON.stringify({ type: "exit", data: "1" }));
        return;
      }
      runCommandStreaming(msg.command, cwd, ws);
    }
  });
});

const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`AI Code Studio backend running on http://localhost:${PORT}`);
});
