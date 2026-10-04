import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.SWEETFROG_DB || join(root, 'data', 'sweetfrog.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS suggestions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS suggestion_votes(suggestion_id INTEGER NOT NULL REFERENCES suggestions(id), user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(suggestion_id,user_id));
CREATE TABLE IF NOT EXISTS topics(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES topics(id), user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS scores(user_id INTEGER NOT NULL REFERENCES users(id), game TEXT NOT NULL, score INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,game));
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(game,score DESC);`);
if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
const adminName = process.env.SWEETFROG_ADMIN_USER;
const adminPassword = process.env.SWEETFROG_ADMIN_PASSWORD;
if (adminName && adminPassword) {
  if (!/^[\p{L}\p{N}_]{3,20}$/u.test(adminName) || adminPassword.length < 12) throw Error('管理员昵称需为 3–20 字，密码至少 12 位');
  const existing = db.prepare('SELECT role FROM users WHERE username=?').get(adminName);
  if (existing && existing.role !== 'admin') throw Error('管理员昵称已被普通玩家占用，请更换昵称');
  if (!existing) db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(adminName, hashPassword(adminPassword));
}

const allowedOrigins = new Set((process.env.SWEETFROG_ORIGINS || 'https://aur3l1us07.github.io,http://127.0.0.1:4175,http://localhost:4175').split(','));
const limiter = new Map();
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.ttf':'font/ttf' };
function json(res, code, value) { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(value)); }
function fail(res, code, message) { json(res, code, { error: message }); }
function rate(ip, scope, limit, period) { const key=`${ip}:${scope}`,now=Date.now();let bucket=limiter.get(key);if(!bucket||now>bucket.until)bucket={count:0,until:now+period};bucket.count++;limiter.set(key,bucket);return bucket.count<=limit; }
async function body(req) { let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>5000)throw Error('内容过长');}try{return JSON.parse(raw||'{}');}catch{throw Error('请求格式有误');} }
function text(value,max) { return typeof value==='string'?value.trim().slice(0,max+1):''; }
function hashPassword(password) { const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
function passwordMatches(password,stored) { const [salt,hex]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hex,'hex')); }
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function auth(req) { const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];if(!token)return null;return db.prepare('SELECT users.id,users.username,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND users.banned=0').get(tokenHash(token),Date.now())||null; }
function session(res,user) { const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token),user.id,Date.now()+30*86400000);json(res,200,{token,user:{id:user.id,username:user.username,role:user.role||'player'}}); }
function suggestionList(userId) { return db.prepare(`SELECT s.id,s.title,s.body,s.created_at AS createdAt,u.username,(SELECT count(*) FROM suggestion_votes v WHERE v.suggestion_id=s.id) AS votes,EXISTS(SELECT 1 FROM suggestion_votes v WHERE v.suggestion_id=s.id AND v.user_id=?) AS voted FROM suggestions s JOIN users u ON u.id=s.user_id ORDER BY votes DESC,s.created_at DESC LIMIT 100`).all(userId||-1); }
function topicList() { return db.prepare(`SELECT t.id,t.title,t.body,t.created_at AS createdAt,u.username,(SELECT count(*) FROM replies r WHERE r.topic_id=t.id) AS replyCount FROM topics t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 100`).all(); }
function rank(game,userId) { const entries=db.prepare(`SELECT u.username,s.score FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game=? ORDER BY s.score DESC,s.updated_at ASC LIMIT 30`).all(game);let last=null,place=0;entries.forEach((entry,index)=>{if(entry.score!==last)place=index+1;last=entry.score;entry.rank=place;});const own=userId?db.prepare('SELECT score FROM scores WHERE game=? AND user_id=?').get(game,userId):null;const self=own?{score:own.score,rank:db.prepare('SELECT count(*) AS n FROM scores WHERE game=? AND score>?').get(game,own.score).n+1}:null;return{entries,self}; }

async function api(req,res,url) {
  const ip=req.socket.remoteAddress||'unknown',user=auth(req),method=req.method;
  if(method==='GET'&&url.pathname==='/api/session')return json(res,200,{user});
  if(method==='POST'&&url.pathname==='/api/register') {
    if(!rate(ip,'auth',8,3600000))return fail(res,429,'尝试次数过多，请稍后再试');
    const data=await body(req),username=text(data.username,20),password=data.password;
    if(!/^[\p{L}\p{N}_]{3,20}$/u.test(username))return fail(res,400,'昵称需为 3–20 个字母、数字、汉字或下划线');
    if(typeof password!=='string'||password.length<8||password.length>128)return fail(res,400,'密码需为 8–128 位');
    try{const result=db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username,hashPassword(password));return session(res,{id:Number(result.lastInsertRowid),username});}
    catch(error){if(String(error).includes('UNIQUE'))return fail(res,409,'这个昵称已被使用');throw error;}
  }
  if(method==='POST'&&url.pathname==='/api/login') {
    if(!rate(ip,'auth',8,3600000))return fail(res,429,'尝试次数过多，请稍后再试');
    const data=await body(req),username=text(data.username,20),password=data.password;
    const account=db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if(!account||typeof password!=='string'||!passwordMatches(password,account.password_hash))return fail(res,401,'昵称或密码不正确');
    if(account.banned)return fail(res,403,'账号已停用');
    return session(res,account);
  }
  if(method==='POST'&&url.pathname==='/api/logout') { const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));return json(res,200,{ok:true}); }
  if(method==='GET'&&url.pathname==='/api/suggestions')return json(res,200,{items:suggestionList(user?.id)});
  if(method==='POST'&&url.pathname==='/api/suggestions') { if(!user)return fail(res,401,'请先登录');if(!rate(`user${user.id}`,'post',20,3600000))return fail(res,429,'发布太频繁');const data=await body(req),title=text(data.title,80),content=text(data.body,500);if(!title||title.length>80||!content||content.length>500)return fail(res,400,'标题或内容长度不合适');db.prepare('INSERT INTO suggestions(user_id,title,body) VALUES(?,?,?)').run(user.id,title,content);return json(res,201,{ok:true}); }
  const vote=/^\/api\/suggestions\/(\d+)\/vote$/.exec(url.pathname);
  if(method==='POST'&&vote) { if(!user)return fail(res,401,'请先登录');if(!db.prepare('SELECT id FROM suggestions WHERE id=?').get(Number(vote[1])))return fail(res,404,'提议不存在');const result=db.prepare('INSERT OR IGNORE INTO suggestion_votes(suggestion_id,user_id) VALUES(?,?)').run(Number(vote[1]),user.id);return json(res,200,{ok:true,added:result.changes===1}); }
  if(method==='GET'&&url.pathname==='/api/topics')return json(res,200,{items:topicList()});
  if(method==='POST'&&url.pathname==='/api/topics') { if(!user)return fail(res,401,'请先登录');if(!rate(`user${user.id}`,'post',20,3600000))return fail(res,429,'发布太频繁');const data=await body(req),title=text(data.title,80),content=text(data.body,2000);if(!title||title.length>80||!content||content.length>2000)return fail(res,400,'标题或内容长度不合适');db.prepare('INSERT INTO topics(user_id,title,body) VALUES(?,?,?)').run(user.id,title,content);return json(res,201,{ok:true}); }
  const replies=/^\/api\/topics\/(\d+)\/replies$/.exec(url.pathname);
  if(replies&&method==='GET')return json(res,200,{items:db.prepare('SELECT r.id,r.body,r.created_at AS createdAt,u.username FROM replies r JOIN users u ON u.id=r.user_id WHERE r.topic_id=? ORDER BY r.created_at ASC LIMIT 200').all(Number(replies[1]))});
  if(replies&&method==='POST') { if(!user)return fail(res,401,'请先登录');if(!rate(`user${user.id}`,'post',20,3600000))return fail(res,429,'发布太频繁');if(!db.prepare('SELECT id FROM topics WHERE id=?').get(Number(replies[1])))return fail(res,404,'话题不存在');const data=await body(req),content=text(data.body,1000);if(!content||content.length>1000)return fail(res,400,'回复长度不合适');db.prepare('INSERT INTO replies(topic_id,user_id,body) VALUES(?,?,?)').run(Number(replies[1]),user.id,content);return json(res,201,{ok:true}); }
  const leader=/^\/api\/leaderboards\/(tap|merge|flap|puzzle|aim)$/.exec(url.pathname);
  if(leader&&method==='GET')return json(res,200,rank(leader[1],user?.id));
  if(leader&&method==='POST') { if(!user)return fail(res,401,'登录后才能上榜');const data=await body(req),score=data.score;if(!Number.isSafeInteger(score)||score<0||score>10000000)return fail(res,400,'成绩无效');db.prepare(`INSERT INTO scores(user_id,game,score) VALUES(?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET score=excluded.score,updated_at=CURRENT_TIMESTAMP WHERE excluded.score>scores.score`).run(user.id,leader[1],score);return json(res,200,{ok:true,self:rank(leader[1],user.id).self}); }
  if(url.pathname.startsWith('/api/admin/')) {
    if(!user)return fail(res,401,'请先登录管理员账号');
    if(user.role!=='admin')return fail(res,403,'没有管理员权限');
    if(method==='GET'&&url.pathname==='/api/admin/overview') {
      const count=table=>db.prepare(`SELECT count(*) AS total FROM ${table}`).get().total;
      return json(res,200,{users:count('users'),suggestions:count('suggestions'),topics:count('topics'),replies:count('replies'),scores:count('scores')});
    }
    if(method==='GET'&&url.pathname==='/api/admin/suggestions')return json(res,200,{items:suggestionList(user.id)});
    if(method==='GET'&&url.pathname==='/api/admin/topics')return json(res,200,{items:topicList()});
    if(method==='GET'&&url.pathname==='/api/admin/users')return json(res,200,{items:db.prepare('SELECT id,username,role,banned,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 200').all()});
    const userBan=/^\/api\/admin\/users\/(\d+)\/ban$/.exec(url.pathname);
    if(method==='POST'&&userBan){const target=db.prepare('SELECT role FROM users WHERE id=?').get(Number(userBan[1]));if(!target)return fail(res,404,'玩家不存在');if(target.role==='admin')return fail(res,403,'不能停用管理员');const data=await body(req);if(typeof data.banned!=='boolean')return fail(res,400,'状态无效');db.prepare('UPDATE users SET banned=? WHERE id=?').run(Number(data.banned),Number(userBan[1]));return json(res,200,{ok:true});}
    const suggestion=/^\/api\/admin\/suggestions\/(\d+)$/.exec(url.pathname);
    if(method==='DELETE'&&suggestion){const id=Number(suggestion[1]);db.exec('BEGIN');try{db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id=?').run(id);db.prepare('DELETE FROM suggestions WHERE id=?').run(id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return json(res,200,{ok:true});}
    const topic=/^\/api\/admin\/topics\/(\d+)$/.exec(url.pathname);
    if(method==='DELETE'&&topic){const id=Number(topic[1]);db.exec('BEGIN');try{db.prepare('DELETE FROM replies WHERE topic_id=?').run(id);db.prepare('DELETE FROM topics WHERE id=?').run(id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return json(res,200,{ok:true});}
    const reply=/^\/api\/admin\/replies\/(\d+)$/.exec(url.pathname);
    if(method==='DELETE'&&reply){db.prepare('DELETE FROM replies WHERE id=?').run(Number(reply[1]));return json(res,200,{ok:true});}
    const scores=/^\/api\/admin\/leaderboards\/(tap|merge|flap|puzzle|aim)$/.exec(url.pathname);
    if(method==='GET'&&scores)return json(res,200,{items:db.prepare('SELECT s.user_id AS userId,u.username,s.score,s.updated_at AS updatedAt FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game=? ORDER BY s.score DESC LIMIT 100').all(scores[1])});
    const score=/^\/api\/admin\/leaderboards\/(tap|merge|flap|puzzle|aim)\/(\d+)$/.exec(url.pathname);
    if(method==='DELETE'&&score){db.prepare('DELETE FROM scores WHERE game=? AND user_id=?').run(score[1],Number(score[2]));return json(res,200,{ok:true});}
  }
  return fail(res,404,'页面不存在');
}
async function staticFile(req,res,url) { const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!(path===root||path.startsWith(root+sep))||path.includes(`${sep}server${sep}`)||path.includes(`${sep}data${sep}`)||path.includes(`${sep}.git${sep}`)||!mime[extname(path)])return fail(res,403,'无法访问');try{if(!(await stat(path)).isFile())return fail(res,404,'文件不存在');const file=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)],'cache-control':'no-store'});res.end(file);}catch{fail(res,404,'文件不存在');} }
const server=http.createServer(async(req,res)=>{const origin=req.headers.origin;if(origin&&allowedOrigins.has(origin)){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','Authorization, Content-Type');res.setHeader('access-control-allow-methods','GET, POST, DELETE, OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(origin&&!allowedOrigins.has(origin)?403:204);return res.end();}const url=new URL(req.url,'http://localhost');try{if(url.pathname.startsWith('/api/'))await api(req,res,url);else if(req.method==='GET')await staticFile(req,res,url);else fail(res,405,'请求方法不支持');}catch(error){if(error.message==='内容过长'||error.message==='请求格式有误')return fail(res,400,error.message);console.error(error);fail(res,500,'服务器暂时不可用');}});
const port=Number(process.env.PORT||4175);server.listen(port,()=>console.log(`Sweetfrog server listening on http://127.0.0.1:${port}`));
