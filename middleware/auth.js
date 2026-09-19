import { getUserBySession } from "../services/db.js";

function bearer(req) {
  const h=req.headers.authorization||"";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/**
 * requireAuth accepts the legacy APP_ACCESS_TOKEN for internal/local access,
 * otherwise it requires a signed-in user session from the database.
 */
export async function requireAuth(req,res,next) {
  try {
    const token=bearer(req);
    if (process.env.APP_ACCESS_TOKEN && token===process.env.APP_ACCESS_TOKEN) {
      req.user={id:"legacy",email:null,name:"Legacy access",isLegacy:true};
      return next();
    }
    const user=await getUserBySession(token);
    if (!user) return res.status(401).json({error:"Unauthorized — please sign in."});
    req.user=user;
    next();
  } catch(err) {
    res.status(500).json({error:err.message});
  }
}

export const requireUser=requireAuth;

export function checkWsToken(urlString) {
  const expected=process.env.APP_ACCESS_TOKEN;
  if (!expected) return true;
  try {
    const url=new URL(urlString,"http://localhost");
    return url.searchParams.get("token")===expected;
  } catch { return false; }
}
