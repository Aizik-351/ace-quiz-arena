const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

function db(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. Connect a Neon database to this Vercel project.');
  return neon(process.env.DATABASE_URL);
}
function parseCookies(req){
  const out={};
  String(req.headers.cookie||'').split(';').forEach(part=>{
    const i=part.indexOf('=');
    if(i<0)return;
    const k=part.slice(0,i).trim();
    const v=part.slice(i+1).trim();
    try{out[k]=decodeURIComponent(v)}catch{out[k]=v}
  });
  return out;
}
function sessionHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
function newSessionToken(){return crypto.randomBytes(32).toString('hex');}
function setSessionCookie(res,token,name='ace_session',maxAge=60*60*24*30){
  res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
function cookieHeader(name,value,maxAge){return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
async function createSession(sql,{userId=null,role='user'}){
  const token=newSessionToken();
  await sql`INSERT INTO ace_sessions(token_hash,user_id,role,expires_at) VALUES(${sessionHash(token)},${userId},${role},NOW()+INTERVAL '30 days')`;
  return token;
}
async function getSession(sql,req,name='ace_session'){
  const cookies=parseCookies(req);
  const token=cookies[name];
  if(!token)return null;
  const rows=await sql`SELECT s.role,s.user_id,s.expires_at,u.name,u.username,u.email FROM ace_sessions s LEFT JOIN ace_users u ON u.id=s.user_id WHERE s.token_hash=${sessionHash(token)} AND s.expires_at>NOW() LIMIT 1`;
  return rows[0]||null;
}
async function destroySession(sql,req,name='ace_session'){
  const cookies=parseCookies(req);
  if(cookies[name]) await sql`DELETE FROM ace_sessions WHERE token_hash=${sessionHash(cookies[name])}`;
}
function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password,stored){
  const [salt,hash]=String(stored||'').split(':');
  if(!salt||!hash)return false;
  const test=crypto.scryptSync(password,salt,64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(test,'hex'));
}
async function init(sql){
  await sql`CREATE TABLE IF NOT EXISTS ace_data (key TEXT PRIMARY KEY, value JSONB NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS ace_users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS ace_sessions (id BIGSERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id BIGINT REFERENCES ace_users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'user', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS ace_sessions_token_hash_idx ON ace_sessions(token_hash)`;
}
async function getData(sql){
  const rows=await sql`SELECT key,value FROM ace_data WHERE key IN ('questions','challenges','results')`;
  const out={questions:null,challenges:[],results:[]};
  for(const r of rows) out[r.key]=r.value;
  return out;
}
async function putData(sql,key,value){
  await sql`INSERT INTO ace_data(key,value) VALUES(${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
}
function cleanUser(row){return {name:row.name, user:row.username, email:row.email};}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const sql=db();
    await init(sql);
    if(req.method==='GET'){
      const data=await getData(sql);
      const session=await getSession(sql,req,'ace_session');
      const adminSession=await getSession(sql,req,'ace_admin_session');
      const user=session?.user_id?{name:session.name,user:session.username,email:session.email}:null;
      return res.status(200).json({ok:true,...data,configured:true,user,isAdmin:adminSession?.role==='admin'});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const body=req.body||{};
    const action=body.action;

    if(action==='adminLogin'){
      const password=String(body.password||'');
      if(!process.env.ADMIN_PASSWORD || password!==process.env.ADMIN_PASSWORD)return res.status(401).json({ok:false,error:'Incorrect admin password.'});
      await destroySession(sql,req,'ace_admin_session');
      const token=await createSession(sql,{role:'admin'});
      setSessionCookie(res,token,'ace_admin_session');
      return res.status(200).json({ok:true,isAdmin:true});
    }

    if(action==='logout'){
      await destroySession(sql,req,'ace_session');
      await destroySession(sql,req,'ace_admin_session');
      res.setHeader('Set-Cookie',[cookieHeader('ace_session','',0),cookieHeader('ace_admin_session','',0)]);
      return res.status(200).json({ok:true});
    }

    if(action==='saveResult'){
      const session=await getSession(sql,req,'ace_session');
      if(!session?.user_id)return res.status(401).json({ok:false,error:'Please sign in before submitting a quiz result.'});
      const result=body.result;
      if(!result||!result.challengeId)return res.status(400).json({ok:false,error:'Invalid quiz result.'});
      const data=await getData(sql);
      const existing=Array.isArray(data.results)?data.results:[];
      const username=session.username||session.email||'Unknown';
      const clean={...result,username};
      const results=[...existing,clean].slice(-10000);
      await putData(sql,'results',results);
      return res.status(200).json({ok:true,results});
    }

    if(action==='signup'){
      const name=String(body.name||'').trim(), username=String(body.user||'').trim(), email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
      if(!name||!username||!email||!password)return res.status(400).json({ok:false,error:'Please complete every field.'});
      try{
        const rows=await sql`INSERT INTO ace_users(name,username,email,password_hash) VALUES(${name},${username},${email},${hashPassword(password)}) RETURNING id,name,username,email`;
        await destroySession(sql,req);
        const token=await createSession(sql,{userId:rows[0].id,role:'user'});
        setSessionCookie(res,token);
        return res.status(200).json({ok:true,user:cleanUser(rows[0])});
      }catch(e){
        if(String(e.message).includes('duplicate')||e.code==='23505')return res.status(409).json({ok:false,error:'That email or username is already registered.'});
        throw e;
      }
    }

    if(action==='login'){
      const email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
      const rows=await sql`SELECT id,name,username,email,password_hash FROM ace_users WHERE email=${email} LIMIT 1`;
      if(!rows[0]||!verifyPassword(password,rows[0].password_hash))return res.status(401).json({ok:false,error:'Incorrect email or password.'});
      await destroySession(sql,req);
      const token=await createSession(sql,{userId:rows[0].id,role:'user'});
      setSessionCookie(res,token);
      return res.status(200).json({ok:true,user:cleanUser(rows[0])});
    }

    const adminSession=await getSession(sql,req,'ace_admin_session');
    if(adminSession?.role!=='admin')return res.status(401).json({ok:false,error:'Administrator authorization required.'});

    if(action==='bootstrap'){
      const data=await getData(sql);
      if(data.questions!==null)return res.status(409).json({ok:false,error:'The shared question bank has already been initialized.'});
      if(!Array.isArray(body.questions))return res.status(400).json({ok:false,error:'No questions supplied.'});
      await putData(sql,'questions',body.questions);
      await putData(sql,'challenges',Array.isArray(body.challenges)?body.challenges:[]);
      return res.status(200).json({ok:true});
    }

    if(action==='saveQuestions'){
      if(!Array.isArray(body.questions))return res.status(400).json({ok:false,error:'Invalid question bank.'});
      await putData(sql,'questions',body.questions);
      return res.status(200).json({ok:true,count:body.questions.length});
    }
    if(action==='saveChallenges'){
      if(!Array.isArray(body.challenges))return res.status(400).json({ok:false,error:'Invalid challenges.'});
      await putData(sql,'challenges',body.challenges);
      return res.status(200).json({ok:true,count:body.challenges.length});
    }
    return res.status(400).json({ok:false,error:'Unknown action.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({ok:false,error:error.message||'Server error'});
  }
};
