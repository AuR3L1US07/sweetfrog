const encode = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encode.encode(value)));
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max + 1) : ''; }
async function body(request) {
  if (Number(request.headers.get('content-length')) > 16000) fail(400, '内容过长');
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16000) { await reader.cancel(); fail(400, '内容过长'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const data = JSON.parse(new TextDecoder().decode(bytes) || '{}'); if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '请求格式有误'); return data; }
  catch { fail(400, '请求格式有误'); }
}
// Web Crypto works in Pages Functions without Node native modules.
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name:'PBKDF2', salt:encode.encode(salt), iterations:100000, hash:'SHA-256' }, key, 256));
}
async function hashPassword(password) { const salt = random(16); return `pbkdf2-sha256:100000:${salt}:${await derive(password, salt)}`; }
async function matches(password, stored) {
  const [algorithm, iterations, salt, expected] = stored.split(':');
  if (algorithm !== 'pbkdf2-sha256' || iterations !== '100000' || !expected) return false;
  const actual = await derive(password, salt);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export async function handleApi(request, env) {
  try {
    if (!env.DB) fail(503, '云数据库尚未配置');
    const db = env.DB;
    const statement = (sql, args = []) => args.length ? db.prepare(sql).bind(...args) : db.prepare(sql);
    const first = (sql, ...args) => statement(sql, args).first();
    const all = async (sql, ...args) => (await statement(sql, args).all()).results;
    const run = (sql, ...args) => statement(sql, args).run();
    const path = new URL(request.url).pathname, method = request.method;
    if (!['GET','POST','DELETE'].includes(method)) fail(405, '请求方法不支持');
    const origin = request.headers.get('origin');
    if (method !== 'GET' && origin && origin !== new URL(request.url).origin) fail(403, '请求来源不允许');
    const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '')?.[1];
    const user = token ? await first('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.banned=0', await digest(token), Date.now()) : null;
    const requireUser = () => { if (!user) fail(401, '请先登录'); };
    async function rate(scope, limit) {
      const key = await digest(scope), now = Date.now();
      const result = await first(`INSERT INTO auth_attempts(ip_hash,count,until) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN auth_attempts.until<=? THEN 1 ELSE auth_attempts.count+1 END,until=CASE WHEN auth_attempts.until<=? THEN excluded.until ELSE auth_attempts.until END RETURNING count`, key, now + 3600000, now, now);
      if (result.count > limit) fail(429, '尝试次数过多，请稍后再试');
    }
    async function session(account) {
      const value = random(32);
      await db.batch([
        statement('DELETE FROM sessions WHERE user_id=? AND expires_at<=?', [account.id, Date.now()]),
        statement('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', [await digest(value), account.id, Date.now()+30*86400000])
      ]);
      return json({ token:value, user:{ id:account.id, username:account.username, role:account.role || 'player' } });
    }
    const suggestions = () => all(`SELECT s.id,s.title,s.body,s.created_at AS createdAt,u.username,(SELECT count(*) FROM suggestion_votes v WHERE v.suggestion_id=s.id) AS votes,EXISTS(SELECT 1 FROM suggestion_votes v WHERE v.suggestion_id=s.id AND v.user_id=?) AS voted FROM suggestions s JOIN users u ON u.id=s.user_id ORDER BY votes DESC,s.created_at DESC,s.id DESC LIMIT 100`, user?.id || -1);
    const topics = () => all(`SELECT t.id,t.title,t.body,t.created_at AS createdAt,u.username,(SELECT count(*) FROM replies r WHERE r.topic_id=t.id) AS replyCount FROM topics t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC,t.id DESC LIMIT 100`);
    async function rank(game) {
      const entries = await all('SELECT u.username,s.score FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game=? ORDER BY s.score DESC,s.updated_at ASC,s.user_id ASC LIMIT 30', game);
      let last = null, place = 0;
      entries.forEach((entry,index) => { if (entry.score !== last) place=index+1; last=entry.score; entry.rank=place; });
      const own = user ? await first('SELECT score FROM scores WHERE game=? AND user_id=?', game, user.id) : null;
      const self = own ? { score:own.score, rank:(await first('SELECT count(*) AS n FROM scores WHERE game=? AND score>?',game,own.score)).n+1 } : null;
      return { entries, self };
    }
    if (method === 'GET' && path === '/api/session') return json({ user });
    if (method === 'POST' && (path === '/api/register' || path === '/api/login')) {
      await rate(`auth:${request.headers.get('CF-Connecting-IP') || 'local'}`, 8);
      const data = await body(request), username = text(data.username,20), password = data.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400,'密码需为 8–128 位');
      if (path === '/api/register') {
        if (!/^[\p{L}\p{N}_]{3,20}$/u.test(username)) fail(400,'昵称需为 3–20 个字母、数字、汉字或下划线');
        let account;
        try { account = await first('INSERT INTO users(username,password_hash) VALUES(?,?) RETURNING id,username,role', username, await hashPassword(password)); }
        catch (error) { if (String(error).includes('UNIQUE')) fail(409,'这个昵称已被使用'); throw error; }
        return session(account);
      }
      const account = await first('SELECT * FROM users WHERE username=?', username);
      // Perform the same derivation for unknown usernames.
      const valid = await matches(password, account?.password_hash || 'pbkdf2-sha256:100000:00000000000000000000000000000000:' + '0'.repeat(64));
      if (!account || !valid) fail(401,'昵称或密码不正确');
      if (account.banned) fail(403,'账号已停用');
      return session(account);
    }
    if (method === 'POST' && path === '/api/logout') { if (token) await run('DELETE FROM sessions WHERE token_hash=?',await digest(token)); return json({ok:true}); }
    const detail=/^\/api\/(suggestions|topics)\/(\d+)$/.exec(path);
    if (detail && method==='GET') {
      const [,,rawId]=detail, id=Number(rawId), suggestion=detail[1]==='suggestions';
      const item=suggestion
        ? await first(`SELECT s.id,s.title,s.body,s.created_at AS createdAt,u.username,(SELECT count(*) FROM suggestion_votes v WHERE v.suggestion_id=s.id) AS votes,EXISTS(SELECT 1 FROM suggestion_votes v WHERE v.suggestion_id=s.id AND v.user_id=?) AS voted FROM suggestions s JOIN users u ON u.id=s.user_id WHERE s.id=?`,user?.id||-1,id)
        : await first(`SELECT t.id,t.title,t.body,t.created_at AS createdAt,u.username,(SELECT count(*) FROM replies r WHERE r.topic_id=t.id) AS replyCount FROM topics t JOIN users u ON u.id=t.user_id WHERE t.id=?`,id);
      if (!item) fail(404,suggestion?'建议不存在':'帖子不存在');
      return json({item});
    }
    if (path === '/api/suggestions' || path === '/api/topics') {
      if (method === 'GET') return json({items:await (path.endsWith('suggestions') ? suggestions() : topics())});
      if (method === 'POST') {
        requireUser(); await rate(`post:${user.id}`,20);
        const data=await body(request), isSuggestion=path.endsWith('suggestions'), max=isSuggestion?500:2000;
        const title=text(data.title,80), content=text(data.body,max);
        if (!title || title.length>80 || !content || content.length>max) fail(400,'标题或内容长度不合适');
        const result=await first(`INSERT INTO ${isSuggestion?'suggestions':'topics'}(user_id,title,body) VALUES(?,?,?) RETURNING id`,user.id,title,content);
        return json({ok:true,id:result.id},201);
      }
    }
    const vote=/^\/api\/suggestions\/(\d+)\/vote$/.exec(path);
    if (vote && method==='POST') {
      requireUser();
      if (!await first('SELECT id FROM suggestions WHERE id=?',Number(vote[1]))) fail(404,'提议不存在');
      const result=await run('INSERT OR IGNORE INTO suggestion_votes(suggestion_id,user_id) VALUES(?,?)',Number(vote[1]),user.id);
      return json({ok:true,added:result.meta.changes===1});
    }
    const replies=/^\/api\/topics\/(\d+)\/replies$/.exec(path);
    if (replies && method==='GET') return json({items:await all('SELECT r.id,r.body,r.created_at AS createdAt,u.username FROM replies r JOIN users u ON u.id=r.user_id WHERE r.topic_id=? ORDER BY r.created_at ASC,r.id ASC LIMIT 200',Number(replies[1]))});
    if (replies && method==='POST') {
      requireUser(); await rate(`post:${user.id}`,20);
      if (!await first('SELECT id FROM topics WHERE id=?',Number(replies[1]))) fail(404,'话题不存在');
      const content=text((await body(request)).body,1000);
      if (!content || content.length>1000) fail(400,'回复长度不合适');
      await run('INSERT INTO replies(topic_id,user_id,body) VALUES(?,?,?)',Number(replies[1]),user.id,content);
      return json({ok:true},201);
    }
    const leader=/^\/api\/leaderboards\/(tap|merge|flap|puzzle|aim)$/.exec(path);
    if (leader && method==='GET') return json(await rank(leader[1]));
    if (leader && method==='POST') {
      requireUser(); const score=(await body(request)).score;
      if (!Number.isSafeInteger(score) || score<0 || score>10000000) fail(400,'成绩无效');
      await run(`INSERT INTO scores(user_id,game,score) VALUES(?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET score=excluded.score,updated_at=CURRENT_TIMESTAMP WHERE excluded.score>scores.score`,user.id,leader[1],score);
      return json({ok:true,self:(await rank(leader[1])).self});
    }
    if (path.startsWith('/api/admin/')) {
      requireUser(); if (user.role!=='admin') fail(403,'没有管理员权限');
      if (method==='GET' && path==='/api/admin/overview') {
        const result={};
        for (const table of ['users','suggestions','topics','replies','scores']) result[table]=(await first(`SELECT count(*) AS n FROM ${table}`)).n;
        return json(result);
      }
      if (method==='GET' && path==='/api/admin/suggestions') return json({items:await suggestions()});
      if (method==='GET' && path==='/api/admin/topics') return json({items:await topics()});
      if (method==='GET' && path==='/api/admin/users') return json({items:await all('SELECT id,username,role,banned,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 200')});
      const ban=/^\/api\/admin\/users\/(\d+)\/ban$/.exec(path);
      if (ban && method==='POST') {
        const target=await first('SELECT role FROM users WHERE id=?',Number(ban[1]));
        if (!target) fail(404,'玩家不存在'); if (target.role==='admin') fail(403,'不能停用管理员');
        const data=await body(request); if (typeof data.banned!=='boolean') fail(400,'状态无效');
        const updates=[statement('UPDATE users SET banned=? WHERE id=?',[Number(data.banned),Number(ban[1])])];
        if(data.banned) updates.push(statement('DELETE FROM sessions WHERE user_id=?',[Number(ban[1])]));
        await db.batch(updates); return json({ok:true});
      }
      const deletion=/^\/api\/admin\/(suggestions|topics|replies)\/(\d+)$/.exec(path);
      if (deletion && method==='DELETE') {
        const table=deletion[1], id=Number(deletion[2]), statements=[];
        if(table==='suggestions') statements.push(statement('DELETE FROM suggestion_votes WHERE suggestion_id=?',[id]));
        if(table==='topics') statements.push(statement('DELETE FROM replies WHERE topic_id=?',[id]));
        statements.push(statement(`DELETE FROM ${table} WHERE id=?`,[id]));
        await db.batch(statements); return json({ok:true});
      }
      const scores=/^\/api\/admin\/leaderboards\/(tap|merge|flap|puzzle|aim)$/.exec(path);
      if (scores && method==='GET') return json({items:await all('SELECT s.user_id AS userId,u.username,s.score,s.updated_at AS updatedAt FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game=? ORDER BY s.score DESC LIMIT 100',scores[1])});
      const score=/^\/api\/admin\/leaderboards\/(tap|merge|flap|puzzle|aim)\/(\d+)$/.exec(path);
      if (score && method==='DELETE') { await run('DELETE FROM scores WHERE game=? AND user_id=?',score[1],Number(score[2])); return json({ok:true}); }
    }
    fail(404,'页面不存在');
  } catch(error) {
    if (!error.status) console.error('Sweetfrog API error',error);
    return json({error:error.status?error.message:'服务器暂时不可用'},error.status || 500);
  }
}