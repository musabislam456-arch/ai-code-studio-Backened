import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import apiRouter from "./routes/api.js";
import authRouter from "./routes/auth.js";
import { runCommandStreaming } from "./services/terminal.js";
import { requireAuth, getWsAuth } from "./middleware/auth.js";
import { initDb } from "./services/db.js";

dotenv.config();

const app=express();
const allowedOrigin=process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json({limit:"20mb"}));
app.use("/api/auth",authRouter);
app.use("/api",requireAuth,apiRouter);

const WORKSPACES_ROOT=path.resolve(process.env.WORKSPACES_ROOT||path.join(process.cwd(),"workspaces"));
fs.mkdirSync(WORKSPACES_ROOT,{recursive:true});

function workspacePath(user,projectId){
  const userPart=String(user?.id||"legacy").replace(/[^a-zA-Z0-9_-]/g,"");
  const projectPart=String(projectId||"my-project").replace(/[^a-zA-Z0-9_-]/g,"");
  const full=path.resolve(WORKSPACES_ROOT,userPart,projectPart);
  if(!full.startsWith(WORKSPACES_ROOT+path.sep)) throw new Error("Invalid workspace.");
  fs.mkdirSync(full,{recursive:true});
  return full;
}

const server=http.createServer(app);
const wss=new WebSocketServer({server,path:"/ws/terminal"});

wss.on("connection",async(ws,req)=>{
  const user=await getWsAuth(req.url);
  if(!user){ws.send(JSON.stringify({type:"stderr",data:"Unauthorized — please sign in.\n"}));ws.close();return;}
  ws.on("message",raw=>{
    let msg;try{msg=JSON.parse(raw.toString())}catch{return;}
    if(msg.type==="run"){
      let cwd;
      try{cwd=workspacePath(user,msg.cwd)}catch(err){ws.send(JSON.stringify({type:"stderr",data:`Invalid workspace: ${err.message}\n`}));ws.send(JSON.stringify({type:"exit",data:"1"}));return;}
      runCommandStreaming(msg.command,cwd,ws);
    }
  });
});

if(process.env.DATABASE_URL){
  initDb().then(()=>console.log("Database initialized.")).catch(err=>console.error("Database init failed:",err.message));
}

const PORT=process.env.PORT||5175;
server.listen(PORT,()=>console.log(`AI Code Studio backend running on http://localhost:${PORT}`));
