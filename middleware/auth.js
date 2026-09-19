import { getUserBySession } from "../services/db.js";

function bearer(req) {
  const h=req.headers.authorization||"";
  return h.startsWith("Bearer ") ? h.slice(7) : (req.query?.token ? String(req.query.token) : "");
}

export async function requireAuth(req,res,next) {
  try {
    const token=bearer(req);
    if (process.env.APP_ACCESS_TOKEN && token===process.env.APP_ACCESS_TOKEN) {
      req.user={id:"legacy",email:null,name:"Legacy access",isLegacy:true};
      return next();
    }
    if (!process.env.DATABASE_URL) {
      return res.status(401).json({error:"Sign-in is not configured yet. Add DATABASE_URL to the backend."});
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

export async function getWsAuth(urlString) {
  try {
    const url=new URL(urlString,"http://localhost");
    const token=url.searchParams.get("token")||"";
    if (process.env.APP_ACCESS_TOKEN && token===process.env.APP_ACCESS_TOKEN) {
      return {id:"legacy",email:null,name:"Legacy access",isLegacy:true};
    }
    if (!process.env.DATABASE_URL) return null;
    return await getUserBySession(token);
  } catch {
    return null;
  }
}

export const checkWsToken = async (urlString) => !!(await getWsAuth(urlString));
