/**
 * Very simple shared-secret auth. Not enterprise-grade, but stops
 * randoms on the internet from running shell commands on your
 * server. Set APP_ACCESS_TOKEN in your environment; the frontend
 * sends it back on every request and on the terminal websocket.
 */
export function requireAuth(req, res, next) {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) {
    // No token configured -> auth disabled (fine for local dev only).
    return next();
  }
  const header = req.headers.authorization || "";
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = fromHeader || req.query.token || null;
  if (provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function checkWsToken(urlString) {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return true; // auth disabled locally
  try {
    const url = new URL(urlString, "http://localhost");
    return url.searchParams.get("token") === expected;
  } catch {
    return false;
  }
}
