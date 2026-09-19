import express from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import {
  findUserByEmail, findUserByGoogleSub, createUser, linkGoogleToUser,
  createSession, createOAuthCode, consumeOAuthCode, deleteSession
} from "../services/db.js";
import { requireUser } from "../middleware/auth.js";

const router = express.Router();

function publicUser(user) {
  return { id:user.id, email:user.email, name:user.name, avatarUrl:user.avatar_url || null };
}

function googleClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth environment variables are not configured.");
  }
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

router.post("/signup", async (req,res) => {
  try {
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    const name=String(req.body?.name||"").trim().slice(0,120);
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:"Valid email required."});
    if (password.length < 8) return res.status(400).json({error:"Password must be at least 8 characters."});
    if (await findUserByEmail(email)) return res.status(409).json({error:"An account with this email already exists."});
    const user=await createUser({email,name,passwordHash:await bcrypt.hash(password,12)});
    const token=await createSession(user.id);
    res.json({token,user:publicUser(user)});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post("/signin", async (req,res) => {
  try {
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    const user=await findUserByEmail(email);
    if (!user || !user.password_hash || !(await bcrypt.compare(password,user.password_hash))) {
      return res.status(401).json({error:"Invalid email or password."});
    }
    const token=await createSession(user.id);
    res.json({token,user:publicUser(user)});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get("/me", requireUser, async (req,res) => res.json({user:publicUser(req.user)}));

router.post("/signout", requireUser, async (req,res) => {
  const token=(req.headers.authorization||"").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  await deleteSession(token);
  res.json({ok:true});
});

router.get("/google", (req,res) => {
  try {
    const client=googleClient();
    const url=client.generateAuthUrl({
      access_type:"offline",
      prompt:"select_account",
      scope:["openid","email","profile"]
    });
    res.redirect(url);
  } catch(err) { res.status(500).send(err.message); }
});

router.get("/google/callback", async (req,res) => {
  try {
    const code=String(req.query?.code||"");
    if (!code) return res.status(400).send("Missing Google authorization code.");
    const client=googleClient();
    const {tokens}=await client.getToken(code);
    if (!tokens.id_token) throw new Error("Google did not return an ID token.");
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID});
    const p=ticket.getPayload();
    if (!p?.sub || !p.email) throw new Error("Google account did not provide the required identity information.");

    let user=await findUserByGoogleSub(p.sub);
    if (!user) {
      user=await findUserByEmail(p.email.toLowerCase());
      user = user
        ? await linkGoogleToUser(user.id,{googleSub:p.sub,name:p.name,avatarUrl:p.picture})
        : await createUser({email:p.email.toLowerCase(),name:p.name,googleSub:p.sub,avatarUrl:p.picture});
    }
    const exchangeCode=await createOAuthCode(user.id);
    const frontend=(process.env.FRONTEND_URL||"").replace(/\/$/,"");
    if (!frontend) throw new Error("FRONTEND_URL not configured.");
    res.redirect(`${frontend}/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
  } catch(err) {
    const frontend=(process.env.FRONTEND_URL||"").replace(/\/$/,"");
    if (frontend) return res.redirect(`${frontend}/?auth_error=${encodeURIComponent(err.message)}`);
    res.status(500).send(err.message);
  }
});

router.post("/google/exchange", async (req,res) => {
  try {
    const code=String(req.body?.code||"");
    if (!code) return res.status(400).json({error:"Missing exchange code."});
    const userId=await consumeOAuthCode(code);
    if (!userId) return res.status(400).json({error:"Google login code expired or already used."});
    const fakeSession=await createSession(userId);
    const user=await findUserByGoogleSub((await (async()=>{return null})()));
    // Fetch the user through session to avoid duplicating a second lookup API.
    const sessionUser=await import("../services/db.js").then(m=>m.getUserBySession(fakeSession));
    res.json({token:fakeSession,user:publicUser(sessionUser)});
  } catch(err) { res.status(500).json({error:err.message}); }
});

export default router;
