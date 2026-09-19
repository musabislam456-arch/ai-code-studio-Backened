import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;
let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set. Add a Railway PostgreSQL connection string.");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function initDb() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text UNIQUE,
      name text NOT NULL DEFAULT '',
      password_hash text,
      google_sub text UNIQUE,
      avatar_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS projects (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
  `);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId) {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await getPool().query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [tokenHash,userId,expires]);
  return token;
}

export async function getUserBySession(token) {
  if (!token) return null;
  const q = await getPool().query(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(token)]
  );
  return q.rows[0] || null;
}

export async function deleteSession(token) {
  if (!token) return;
  await getPool().query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
}

export async function findUserByEmail(email) {
  const q = await getPool().query("SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1", [email]);
  return q.rows[0] || null;
}

export async function findUserByGoogleSub(sub) {
  const q = await getPool().query("SELECT * FROM users WHERE google_sub=$1 LIMIT 1", [sub]);
  return q.rows[0] || null;
}

export async function createUser({ email, name, passwordHash = null, googleSub = null, avatarUrl = null }) {
  const id = crypto.randomUUID();
  const q = await getPool().query(
    "INSERT INTO users (id,email,name,password_hash,google_sub,avatar_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [id,email || null,name || "",passwordHash,googleSub,avatarUrl]
  );
  return q.rows[0];
}

export async function linkGoogleToUser(userId, { googleSub, name, avatarUrl }) {
  const q = await getPool().query(
    "UPDATE users SET google_sub=$1,name=COALESCE(NULLIF($2,''),name),avatar_url=COALESCE($3,avatar_url),updated_at=now() WHERE id=$4 RETURNING *",
    [googleSub,name || "",avatarUrl || null,userId]
  );
  return q.rows[0];
}

export async function listProjects(userId) {
  const q = await getPool().query("SELECT * FROM projects WHERE user_id=$1 ORDER BY updated_at DESC", [userId]);
  return q.rows;
}

export async function getProject(userId, projectId) {
  const q = await getPool().query("SELECT * FROM projects WHERE user_id=$1 AND id=$2 LIMIT 1", [userId,projectId]);
  return q.rows[0] || null;
}

export async function createProject(userId, name) {
  const id = crypto.randomUUID();
  const q = await getPool().query(
    "INSERT INTO projects (id,user_id,name) VALUES ($1,$2,$3) RETURNING *",
    [id,userId,(name || "Untitled project").trim().slice(0,120) || "Untitled project"]
  );
  return q.rows[0];
}

export async function renameProject(userId, projectId, name) {
  const q = await getPool().query(
    "UPDATE projects SET name=$1,updated_at=now() WHERE user_id=$2 AND id=$3 RETURNING *",
    [(name || "Untitled project").trim().slice(0,120) || "Untitled project",userId,projectId]
  );
  return q.rows[0] || null;
}

export async function touchProject(userId, projectId) {
  await getPool().query("UPDATE projects SET updated_at=now() WHERE user_id=$1 AND id=$2", [userId,projectId]);
}

export async function deleteProject(userId, projectId) {
  const q = await getPool().query("DELETE FROM projects WHERE user_id=$1 AND id=$2 RETURNING id", [userId,projectId]);
  return !!q.rows[0];
}

export async function createOAuthCode(userId) {
  const code = newToken();
  const expires = new Date(Date.now() + 1000 * 60 * 5);
  await getPool().query("INSERT INTO oauth_codes (code_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(code),userId,expires]);
  return code;
}

export async function consumeOAuthCode(code) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const q = await client.query("SELECT user_id FROM oauth_codes WHERE code_hash=$1 AND expires_at>now() FOR UPDATE", [hashToken(code)]);
    if (!q.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query("DELETE FROM oauth_codes WHERE code_hash=$1", [hashToken(code)]);
    await client.query("COMMIT");
    return q.rows[0].user_id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cleanupAuthRows() {
  await getPool().query("DELETE FROM sessions WHERE expires_at<=now(); DELETE FROM oauth_codes WHERE expires_at<=now();");
}
