import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "node:path";
import apiRouter from "./routes/api.js";
import { runCommandStreaming } from "./services/terminal.js";
import { requireAuth, checkWsToken } from "./middleware/auth.js";

dotenv.config();

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN; // e.g. https://your-app.vercel.app
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json({ limit: "20mb" }));
app.use("/api", requireAuth, apiRouter);

const server = http.createServer(app);

// ---------- Terminal over WebSocket ----------
const wss = new WebSocketServer({ server, path: "/ws/terminal" });

wss.on("connection", (ws, req) => {
  if (!checkWsToken(req.url)) {
    ws.send(JSON.stringify({ type: "stderr", data: "Unauthorized\n" }));
    ws.close();
    return;
  }
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "run") {
      const cwd = msg.cwd || process.cwd();
      runCommandStreaming(msg.command, cwd, ws);
    }
  });
});

const PORT = process.env.PORT || 5175;
server.listen(PORT, () => {
  console.log(`AI Code Studio backend running on http://localhost:${PORT}`);
});
