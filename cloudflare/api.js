import { PK_DURATION_MS, pkRows, pkValidBatch } from '../pk-core.js';

const encode = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const randomPlayerId = () => 10000 + crypto.getRandomValues(new Uint32Array(1))[0] % 90000;
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encode.encode(value)));
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max + 1) : ''; }
async function body(request, max=16000) {
  if (Number(request.headers.get('content-length')) > max) fail(400, '内容过长');
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); fail(400, '内容过长'); }
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
    const user = token ? await first('SELECT u.id,u.public_id AS publicId,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.banned=0', await digest(token), Date.now()) : null;
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
      return json({ token:value, user:{ id:account.id, publicId:account.publicId, username:account.username, role:account.role || 'player' } });
    }
    const suggestions = () => all(`SELECT s.id,s.title,s.body,s.created_at AS createdAt,u.username,u.id AS userId,(SELECT count(*) FROM suggestion_votes v WHERE v.suggestion_id=s.id) AS votes,EXISTS(SELECT 1 FROM suggestion_votes v WHERE v.suggestion_id=s.id AND v.user_id=?) AS voted FROM suggestions s JOIN users u ON u.id=s.user_id ORDER BY votes DESC,s.created_at DESC,s.id DESC LIMIT 100`, user?.id || -1);
    const topics = () => all(`SELECT t.id,t.title,t.body,t.created_at AS createdAt,u.username,u.id AS userId,(SELECT count(*) FROM replies r WHERE r.topic_id=t.id) AS replyCount FROM topics t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC,t.id DESC LIMIT 100`);
    async function rank(game) {
      const entries = await all('SELECT u.username,u.id AS userId,s.score FROM scores s JOIN users u ON u.id=s.user_id WHERE s.game=? ORDER BY s.score DESC,s.updated_at ASC,s.user_id ASC LIMIT 30', game);
      let last = null, place = 0;
      entries.forEach((entry,index) => { if (entry.score !== last) place=index+1; last=entry.score; entry.rank=place; });
      const own = user ? await first('SELECT score FROM scores WHERE game=? AND user_id=?', game, user.id) : null;
      const self = own ? { score:own.score, rank:(await first('SELECT count(*) AS n FROM scores WHERE game=? AND score>?',game,own.score)).n+1 } : null;
      return { entries, self };
    }
    const matchGames=['tap','merge','flap','puzzle','aim'];
    async function presenceState(){
      const cutoff=Date.now()-70000,queueCutoff=Date.now()-16000;
      const total=(await first('SELECT count(*) AS n FROM online_presence WHERE last_seen>=?',cutoff)).n;
      const online=Object.fromEntries(matchGames.map(game=>[game,0]));
      const waiting=Object.fromEntries(matchGames.map(game=>[game,0]));
      for(const row of await all('SELECT game,count(*) AS n FROM online_presence WHERE last_seen>=? AND game IS NOT NULL GROUP BY game',cutoff))if(row.game in online)online[row.game]=row.n;
      for(const row of await all("SELECT game,count(*) AS n FROM match_queue WHERE status='waiting' AND last_seen>=? GROUP BY game",queueCutoff))if(row.game in waiting)waiting[row.game]=row.n;
      return {total,online,waiting};
    }
    async function onlinePlayers(){
      const cutoff=Date.now()-70000;
      const guests=(await first('SELECT count(*) AS n FROM online_presence WHERE last_seen>=? AND user_id IS NULL',cutoff)).n;
      const registered=(await first('SELECT count(*) AS n FROM online_presence p JOIN users u ON u.id=p.user_id WHERE p.last_seen>=? AND u.banned=0',cutoff)).n;
      const players=await all('SELECT u.id,u.public_id AS publicId,u.username,p.game FROM online_presence p JOIN users u ON u.id=p.user_id WHERE p.last_seen>=? AND u.banned=0 ORDER BY p.last_seen DESC,u.id LIMIT 100',cutoff);
      return {total:guests+registered,guests,registered,players,remaining:Math.max(0,registered-players.length)};
    }
    async function queueState(){
      const row=await first('SELECT game,status,room_code FROM match_queue WHERE user_id=?',user.id);
      return row?{game:row.game,status:row.status,roomCode:row.room_code}:null;
    }
    async function findMatch(){
      const now=Date.now();
      await run("UPDATE match_queue SET status='waiting' WHERE status='matching' AND last_seen<? AND room_code IS NULL",now-6000);
      const mine=await first("UPDATE match_queue SET status='matching',last_seen=? WHERE user_id=? AND status='waiting' RETURNING game,joined_at",now,user.id);
      if(!mine)return queueState();
      const other=await first("UPDATE match_queue SET status='matching' WHERE user_id=(SELECT q.user_id FROM match_queue q JOIN users u ON u.id=q.user_id WHERE q.game=? AND q.status='waiting' AND q.last_seen>=? AND u.banned=0 AND (q.joined_at<? OR (q.joined_at=? AND q.user_id<?)) ORDER BY q.joined_at,q.user_id LIMIT 1) AND status='waiting' RETURNING user_id",mine.game,now-16000,mine.joined_at,mine.joined_at,user.id);
      if(!other){await run("UPDATE match_queue SET status='waiting' WHERE user_id=? AND status='matching'",user.id);return queueState();}
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      try{
        for(let attempt=0;attempt<5;attempt++){
          const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),value=>alphabet[value%alphabet.length]).join('');
          try{
            await db.batch([
              statement('INSERT INTO pk_rooms(code,host_id,guest_id,game,host_ready,guest_ready,seed,starts_at,created_at) VALUES(?,?,?,?,1,1,?,?,?)',[code,other.user_id,user.id,mine.game,crypto.getRandomValues(new Uint32Array(1))[0],now+7000,now]),
              statement("UPDATE match_queue SET status='matched',room_code=? WHERE user_id=? AND status='matching'",[code,other.user_id]),
              statement("UPDATE match_queue SET status='matched',room_code=? WHERE user_id=? AND status='matching'",[code,user.id])
            ]);
            return queueState();
          }catch(error){if(!String(error).includes('UNIQUE'))throw error;}
        }
        fail(503,'创建对战房间失败，请重试');
      }catch(error){
        await run("UPDATE match_queue SET status='waiting' WHERE user_id IN (?,?) AND status='matching'",user.id,other.user_id);
        throw error;
      }
    }
    if(path==='/api/presence'&&method==='GET')return json(await presenceState());
    if(path==='/api/presence/players'&&method==='GET')return json(await onlinePlayers());
    if(path==='/api/presence'&&method==='POST'){
      const data=await body(request),visitorId=data.visitorId,game=data.game||null;
      if(!/^[a-f0-9]{32}$/.test(visitorId)||game!==null&&!matchGames.includes(game))fail(400,'在线状态无效');
      const key=user?`u:${user.id}`:`g:${visitorId}`,now=Date.now();
      await run('DELETE FROM online_presence WHERE last_seen<?',now-86400000);
      if(user)await run('DELETE FROM online_presence WHERE client_key=?',`g:${visitorId}`);
      await run('INSERT INTO online_presence(client_key,user_id,game,last_seen) VALUES(?,?,?,?) ON CONFLICT(client_key) DO UPDATE SET game=excluded.game,last_seen=excluded.last_seen',key,user?.id||null,game,now);
      return json(await presenceState());
    }
    const friendPair=otherId=>[Math.min(user.id,otherId),Math.max(user.id,otherId)];
    const friendship=async otherId=>first('SELECT status,requester_id AS requesterId,updated_at AS updatedAt FROM friend_links WHERE user_low=? AND user_high=?',...friendPair(otherId));
    async function friendSummary(){
      const friends=await all(`SELECT u.id,u.public_id AS publicId,u.username,EXISTS(SELECT 1 FROM online_presence p WHERE p.user_id=u.id AND p.last_seen>=?) AS online,(SELECT count(*) FROM friend_messages m WHERE m.sender_id=u.id AND m.recipient_id=? AND m.read_at IS NULL) AS unread FROM friend_links f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END WHERE (f.user_low=? OR f.user_high=?) AND f.status='accepted' AND u.banned=0 ORDER BY online DESC,u.username COLLATE NOCASE`,Date.now()-70000,user.id,user.id,user.id,user.id);
      const requests=await all(`SELECT u.id,u.public_id AS publicId,u.username,f.requester_id AS requesterId FROM friend_links f JOIN users u ON u.id=CASE WHEN f.user_low=? THEN f.user_high ELSE f.user_low END WHERE (f.user_low=? OR f.user_high=?) AND f.status='pending' AND u.banned=0 ORDER BY f.updated_at DESC LIMIT 100`,user.id,user.id,user.id);
      return {self:{id:user.id,publicId:user.publicId,username:user.username},friends,incoming:requests.filter(item=>item.requesterId!==user.id),outgoing:requests.filter(item=>item.requesterId===user.id),unread:friends.reduce((sum,item)=>sum+item.unread,0)};
    }
    if(path==='/api/friends'&&method==='GET'){requireUser();return json(await friendSummary());}
    if(path==='/api/friends/search'&&method==='GET'){
      requireUser();await rate(`friend-search:${user.id}`,120);
      const query=text(new URL(request.url).searchParams.get('q'),20);
      if(!query||query.length>20)fail(400,'请输入玩家昵称或 ID');
      const matches=await all(`SELECT u.id,u.public_id AS publicId,u.username,f.status,f.requester_id AS requesterId FROM users u LEFT JOIN friend_links f ON f.user_low=min(?,u.id) AND f.user_high=max(?,u.id) WHERE u.id<>? AND u.banned=0 AND (u.public_id=? OR instr(lower(u.username),lower(?))=1) ORDER BY CASE WHEN u.public_id=? OR lower(u.username)=lower(?) THEN 0 ELSE 1 END,u.username LIMIT 12`,user.id,user.id,user.id,/^\d{5}$/.test(query)?Number(query):-1,query,/^\d{5}$/.test(query)?Number(query):-1,query);
      return json({self:{id:user.id,publicId:user.publicId},players:matches});
    }
    if(path==='/api/friends/requests'&&method==='POST'){
      requireUser();await rate(`friend-request:${user.id}`,30);
      const targetId=(await body(request)).userId;
      if(!Number.isSafeInteger(targetId)||targetId<1||targetId===user.id)fail(400,'请选择其他玩家');
      if(!await first('SELECT id FROM users WHERE id=? AND banned=0',targetId))fail(404,'玩家不存在');
      const [low,high]=friendPair(targetId),now=Date.now();
      const result=await run(`INSERT INTO friend_links(user_low,user_high,requester_id,status,updated_at) VALUES(?,?,?,'pending',?) ON CONFLICT(user_low,user_high) DO UPDATE SET requester_id=excluded.requester_id,status='pending',updated_at=excluded.updated_at WHERE friend_links.status='declined' AND friend_links.updated_at<?`,low,high,user.id,now,now-86400000);
      if(!result.meta.changes)fail(409,'已有好友关系或申请；被拒绝后需等待一天再申请');
      return json({ok:true},201);
    }
    const requestDecision=/^\/api\/friends\/requests\/(\d+)$/.exec(path);
    if(requestDecision&&method==='POST'){
      requireUser();const otherId=Number(requestDecision[1]),decision=(await body(request)).decision;
      if(!['accept','decline','cancel'].includes(decision)||!Number.isSafeInteger(otherId)||otherId===user.id)fail(400,'申请操作无效');
      const [low,high]=friendPair(otherId),relation=await friendship(otherId);
      if(!relation||relation.status!=='pending')fail(409,'申请已处理');
      if(decision==='cancel'&&relation.requesterId!==user.id||decision!=='cancel'&&relation.requesterId===user.id)fail(403,'不能处理这份申请');
      const result=decision==='cancel'
        ?await run("DELETE FROM friend_links WHERE user_low=? AND user_high=? AND status='pending' AND requester_id=?",low,high,user.id)
        :await run("UPDATE friend_links SET status=?,updated_at=? WHERE user_low=? AND user_high=? AND status='pending' AND requester_id=?",decision==='accept'?'accepted':'declined',Date.now(),low,high,otherId);
      if(!result.meta.changes)fail(409,'申请已处理');return json({ok:true});
    }
    const friendRemoval=/^\/api\/friends\/(\d+)$/.exec(path);
    if(friendRemoval&&method==='DELETE'){
      requireUser();const otherId=Number(friendRemoval[1]);if(!Number.isSafeInteger(otherId)||otherId===user.id)fail(400,'好友无效');
      const result=await run("DELETE FROM friend_links WHERE user_low=? AND user_high=? AND status='accepted'",...friendPair(otherId));
      if(!result.meta.changes)fail(404,'好友关系不存在');return json({ok:true});
    }
    const messagePath=/^\/api\/friends\/(\d+)\/messages$/.exec(path);
    if(messagePath){
      requireUser();const otherId=Number(messagePath[1]);
      if(!Number.isSafeInteger(otherId)||otherId===user.id||(await friendship(otherId))?.status!=='accepted')fail(403,'只有好友可以私信');
      if(method==='GET'){
        const after=Number(new URL(request.url).searchParams.get('after')||0);
        if(!Number.isSafeInteger(after)||after<0)fail(400,'消息位置无效');
        await run('UPDATE friend_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL',Date.now(),otherId,user.id);
        const messages=after
          ?await all('SELECT id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt,read_at AS readAt FROM friend_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND id>? ORDER BY id ASC LIMIT 100',user.id,otherId,otherId,user.id,after)
          :await all('SELECT * FROM (SELECT id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt,read_at AS readAt FROM friend_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 50) ORDER BY id ASC',user.id,otherId,otherId,user.id);
        return json({messages});
      }
      if(method==='POST'){
        await rate(`friend-message:${user.id}`,240);
        const content=text((await body(request)).body,1000);
        if(!content||content.length>1000)fail(400,'消息长度需为 1–1000 字');
        const createdAt=Date.now(),result=await first('INSERT INTO friend_messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?) RETURNING id',user.id,otherId,content,createdAt);
        return json({message:{id:result.id,senderId:user.id,recipientId:otherId,body:content,createdAt,readAt:null}},201);
      }
    }
    if(path==='/api/pk/invites'){
      requireUser();
      if(method==='GET'){
        const incoming=await all(`SELECT i.id,i.room_code AS roomCode,i.from_user AS fromUser,u.username,r.game FROM pk_invites i JOIN users u ON u.id=i.from_user JOIN pk_rooms r ON r.code=i.room_code WHERE i.to_user=? AND i.status='pending' AND i.created_at>=? AND r.guest_id IS NULL AND r.starts_at IS NULL ORDER BY i.created_at DESC LIMIT 30`,user.id,Date.now()-600000);
        return json({incoming});
      }
      if(method==='POST'){
        await rate(`pk-invite:${user.id}`,30);const data=await body(request),targetId=data.userId,code=data.code;
        if(!Number.isSafeInteger(targetId)||targetId<1||targetId===user.id||typeof code!=='string'||!/^[A-HJ-NP-Z2-9]{6}$/.test(code))fail(400,'邀请信息无效');
        if((await friendship(targetId))?.status!=='accepted')fail(403,'只能邀请好友');
        const target=await first('SELECT user_id FROM online_presence WHERE user_id=? AND last_seen>=?',targetId,Date.now()-70000);
        if(!target)fail(409,'好友当前不在线');
        const inviteRoom=await first('SELECT host_id,guest_id,starts_at,created_at FROM pk_rooms WHERE code=?',code);
        if(!inviteRoom||inviteRoom.host_id!==user.id||inviteRoom.guest_id||inviteRoom.starts_at||inviteRoom.created_at<Date.now()-86400000)fail(409,'房间已满或无法邀请');
        const result=await run("INSERT OR IGNORE INTO pk_invites(room_code,from_user,to_user,status,created_at) VALUES(?,?,?,'pending',?)",code,user.id,targetId,Date.now());
        return json({ok:true,alreadySent:!result.meta.changes},result.meta.changes?201:200);
      }
    }
    const inviteDecision=/^\/api\/pk\/invites\/(\d+)$/.exec(path);
    if(inviteDecision&&method==='POST'){
      requireUser();const id=Number(inviteDecision[1]),decision=(await body(request)).decision;
      if(!Number.isSafeInteger(id)||!['accept','decline'].includes(decision))fail(400,'邀请操作无效');
      const invite=await first("SELECT i.*,r.guest_id,r.starts_at,r.created_at AS room_created FROM pk_invites i JOIN pk_rooms r ON r.code=i.room_code WHERE i.id=? AND i.to_user=? AND i.status='pending'",id,user.id);
      if(!invite)fail(404,'邀请不存在或已处理');
      if(invite.created_at<Date.now()-600000||invite.room_created<Date.now()-86400000||invite.guest_id||invite.starts_at){await run("UPDATE pk_invites SET status='expired' WHERE id=? AND status='pending'",id);fail(409,'邀请已过期');}
      if(decision==='decline'){await run("UPDATE pk_invites SET status='declined' WHERE id=? AND to_user=? AND status='pending'",id,user.id);return json({ok:true});}
      const result=await run('UPDATE pk_rooms SET guest_id=? WHERE code=? AND host_id=? AND guest_id IS NULL AND starts_at IS NULL',user.id,invite.room_code,invite.from_user);
      if(!result.meta.changes)fail(409,'房间已满或已开始');
      await run("UPDATE pk_invites SET status=CASE WHEN id=? THEN 'accepted' ELSE 'expired' END WHERE room_code=? AND status='pending'",id,invite.room_code);
      return json({ok:true,roomCode:invite.room_code});
    }
    if(path==='/api/match/queue'){
      requireUser();const now=Date.now();
      if(method==='POST'){
        const game=(await body(request)).game;if(!matchGames.includes(game))fail(400,'请选择对战游戏');await rate(`match-join:${user.id}`,30);
        const existing=await queueState();
        if(existing?.status==='matched'||existing?.status==='matching')return json({queue:existing});
        if(existing?.status==='waiting'&&existing.game===game)return json({queue:await findMatch()});
        await run('DELETE FROM match_queue WHERE last_seen<?',now-86400000);
        await run('INSERT INTO match_queue(user_id,game,status,joined_at,last_seen,room_code) VALUES(?,?,\'waiting\',?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET game=excluded.game,status=\'waiting\',joined_at=excluded.joined_at,last_seen=excluded.last_seen,room_code=NULL',user.id,game,now,now);
        return json({queue:await findMatch()});
      }
      if(method==='GET'){
        await run("UPDATE match_queue SET last_seen=? WHERE user_id=? AND status='waiting'",now,user.id);
        const queue=await queueState();
        if(queue?.status==='matched'){
          const matchRoom=await first('SELECT starts_at FROM pk_rooms WHERE code=?',queue.roomCode);
          if(!matchRoom||now>matchRoom.starts_at+PK_DURATION_MS+10000){await run('DELETE FROM match_queue WHERE user_id=? AND status=\'matched\'',user.id);return json({queue:null});}
        }
        return json({queue:queue?.status==='waiting'?await findMatch():queue});
      }
      if(method==='DELETE'){
        const ack=(await body(request)).ack===true;
        const result=await run(ack?"DELETE FROM match_queue WHERE user_id=? AND status IN ('waiting','matched')":"DELETE FROM match_queue WHERE user_id=? AND status='waiting'",user.id);
        if(!result.meta.changes){const current=await queueState();if(current?.status==='matched')fail(409,'已经匹配成功，正在进入房间');if(current?.status==='matching')fail(409,'正在确认对手，请稍候');}
        return json({ok:true});
      }
    }
    if (method === 'GET' && path === '/api/session') return json({ user });
    const avatarPath=/^\/api\/avatars\/(\d+)$/.exec(path);
    if (method==='GET' && avatarPath) {
      const account=await first('SELECT avatar_data FROM users WHERE id=?',Number(avatarPath[1]));
      if(!account)fail(404,'玩家不存在');
      if(!account.avatar_data)return Response.redirect(new URL('/assets/default-frog-avatar.svg',request.url),302);
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(account.avatar_data);
      if(!match)fail(500,'头像暂时无法读取');
      const bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));
      return new Response(bytes,{headers:{'Content-Type':'image/'+match[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }

    if (method === 'POST' && (path === '/api/register' || path === '/api/login')) {
      await rate(`auth:${request.headers.get('CF-Connecting-IP') || 'local'}`, 8);
      const data = await body(request), username = text(data.username,20), password = data.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400,'密码需为 8–128 位');
      if (path === '/api/register') {
        if (!/^[\p{L}\p{N}_]{3,20}$/u.test(username)) fail(400,'昵称需为 3–20 个字母、数字、汉字或下划线');
        let account;
        const passwordHash=await hashPassword(password);
        for(let attempt=0;attempt<20&&!account;attempt++){
          try{account=await first('INSERT INTO users(public_id,username,password_hash) VALUES(?,?,?) RETURNING id,public_id AS publicId,username,role',randomPlayerId(),username,passwordHash);}
          catch(error){
            if(!String(error).includes('UNIQUE'))throw error;
            if(await first('SELECT id FROM users WHERE username=?',username))fail(409,'这个昵称已被使用');
          }
        }
        if(!account)fail(503,'暂时无法分配玩家 ID，请稍后重试');
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
    if (path === '/api/profile') {
      requireUser();
      if (method==='GET') return json({profile:await first('SELECT id,public_id AS publicId,username,role,created_at AS createdAt FROM users WHERE id=?',user.id)});
    }
    if (method==='POST' && path==='/api/profile/avatar') {
      requireUser(); await rate(`avatar:${user.id}`,12);
      const data=await body(request,90000),avatar=data.avatarData;
      if(avatar!==null&&(typeof avatar!=='string'||avatar.length>70000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))fail(400,'头像格式或大小不支持');
      await run('UPDATE users SET avatar_data=? WHERE id=?',avatar,user.id);
      return json({ok:true});
    }
    if (method==='POST' && path.startsWith('/api/profile/')) {
      requireUser(); await rate(`profile:${user.id}`,8);
      const data=await body(request),account=await first('SELECT password_hash FROM users WHERE id=?',user.id);
      if(typeof data.currentPassword!=='string'||!await matches(data.currentPassword,account.password_hash))fail(403,'当前密码不正确');
      if(path==='/api/profile/username') {
        const username=text(data.username,20);
        if(!/^[\p{L}\p{N}_]{3,20}$/u.test(username))fail(400,'昵称需为 3–20 个字母、数字、汉字或下划线');
        try{await run('UPDATE users SET username=? WHERE id=?',username,user.id);}
        catch(error){if(String(error).includes('UNIQUE'))fail(409,'这个昵称已被使用');throw error;}
        return json({ok:true,user:{...user,username}});
      }
      if(path==='/api/profile/password') {
        const password=data.newPassword;
        if(typeof password!=='string'||password.length<8||password.length>128)fail(400,'新密码需为 8–128 位');
        if(await matches(password,account.password_hash))fail(400,'新密码不能与当前密码相同');
        await db.batch([
          statement('UPDATE users SET password_hash=? WHERE id=?',[await hashPassword(password),user.id]),
          statement('DELETE FROM sessions WHERE user_id=?',[user.id])
        ]);
        return json({ok:true});
      }
    }

    const roomPath=/^\/api\/pk\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|ready|hit|score|rematch))?$/.exec(path);
    const roomQuery=`SELECT r.*,h.username AS host_name,g.username AS guest_name FROM pk_rooms r JOIN users h ON h.id=r.host_id LEFT JOIN users g ON g.id=r.guest_id WHERE r.code=?`;
    const getRoom=code=>first(roomQuery,code);
    function roomState(room,now=Date.now()) {
      const phase=!room.guest_id?'waiting':!room.starts_at?'ready':now<room.starts_at?'countdown':now<room.starts_at+PK_DURATION_MS?'playing':'finished';
      return {code:room.code,game:room.game,round:room.round,revision:room.revision,rematchBy:room.rematch_by,phase,serverNow:now,startsAt:room.starts_at,endsAt:room.starts_at?room.starts_at+PK_DURATION_MS:null,seed:room.seed,host:{id:room.host_id,name:room.host_name,ready:Boolean(room.host_ready),score:room.host_score,seq:room.host_seq},guest:room.guest_id?{id:room.guest_id,name:room.guest_name,ready:Boolean(room.guest_ready),score:room.guest_score,seq:room.guest_seq}:null,winnerId:phase==='finished'?(room.host_score===room.guest_score?null:room.host_score>room.guest_score?room.host_id:room.guest_id):null,rows:room.game==='tap'?pkRows(room.seed,user?.id===room.host_id?room.host_score:room.guest_score):null};
    }
    if(method==='POST' && path==='/api/pk/rooms') {
      requireUser();await rate(`pk-create:${user.id}`,12);
      const game=(await body(request)).game || 'tap';
      if(!['tap','merge','flap','puzzle','aim'].includes(game))fail(400,'请选择支持的游戏');
      await run('DELETE FROM pk_rooms WHERE created_at<?',Date.now()-30*86400000);
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for(let attempt=0;attempt<5;attempt++){
        const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),value=>alphabet[value%alphabet.length]).join('');
        try{await run('INSERT INTO pk_rooms(code,host_id,game,seed,created_at) VALUES(?,?,?,?,?)',code,user.id,game,crypto.getRandomValues(new Uint32Array(1))[0],Date.now());return json({room:roomState(await getRoom(code))},201);}
        catch(error){if(!String(error).includes('UNIQUE'))throw error;}
      }
      fail(503,'创建房间失败，请重试');
    }
    if(roomPath){
      requireUser();const code=roomPath[1],action=roomPath[2];
      let room=await getRoom(code);
      if(!room||room.created_at<Date.now()-86400000)fail(404,'房间不存在或已过期');
      if(action==='join'&&method==='POST'){
        if(user.id!==room.host_id&&user.id!==room.guest_id){
          const result=await run('UPDATE pk_rooms SET guest_id=? WHERE code=? AND guest_id IS NULL AND host_id<>? AND starts_at IS NULL',user.id,code,user.id);
          if(!result.meta.changes)fail(409,'房间已满或已开始');
        }
        return json({room:roomState(await getRoom(code))});
      }
      if(user.id!==room.host_id&&user.id!==room.guest_id)fail(404,'房间不存在或已过期');
      if(!action&&method==='GET')return json({room:roomState(room)});
      if(action==='ready'&&method==='POST'){
        if(!room.guest_id)fail(409,'等待朋友加入房间');
        if(room.starts_at)fail(409,'本局已经开始');
        const column=user.id===room.host_id?'host_ready':'guest_ready';
        await run(`UPDATE pk_rooms SET ${column}=1 WHERE code=? AND starts_at IS NULL`,code);
        const now=Date.now();
        await run('UPDATE pk_rooms SET starts_at=? WHERE code=? AND host_ready=1 AND guest_ready=1 AND starts_at IS NULL',now+3500,code);
        return json({room:roomState(await getRoom(code))});
      }
      if(action==='rematch'&&method==='POST'){
        const decision=(await body(request)).decision,now=Date.now();
        if(!['request','accept','cancel'].includes(decision))fail(400,'请选择有效操作');
        if(!room.guest_id||!room.starts_at||now<room.starts_at+PK_DURATION_MS+1200)fail(409,'请等待本局成绩结算');
        let result;
        if(decision==='request'){
          result=await run('UPDATE pk_rooms SET rematch_by=?,revision=revision+1 WHERE code=? AND round=? AND rematch_by IS NULL AND starts_at+?<=?',user.id,code,room.round,PK_DURATION_MS+1200,now);
          if(!result.meta.changes){
            const current=await getRoom(code);
            if(current.round!==room.round||current.rematch_by!==user.id)fail(409,'房间状态已更新，请刷新后重试');
          }
        }else if(decision==='cancel'){
          result=await run('UPDATE pk_rooms SET rematch_by=NULL,revision=revision+1 WHERE code=? AND round=? AND rematch_by=?',code,room.round,user.id);
          if(!result.meta.changes)fail(409,'没有可撤回的邀约');
        }else{
          const seed=crypto.getRandomValues(new Uint32Array(1))[0];
          result=await run('UPDATE pk_rooms SET round=round+1,revision=revision+1,rematch_by=NULL,host_ready=1,guest_ready=1,host_score=0,guest_score=0,host_seq=0,guest_seq=0,host_last_hit=0,guest_last_hit=0,seed=?,starts_at=? WHERE code=? AND round=? AND rematch_by IS NOT NULL AND rematch_by<>? AND starts_at+?<=?',seed,now+3500,code,room.round,user.id,PK_DURATION_MS+1200,now);
          if(!result.meta.changes)fail(409,'邀约已失效，请刷新房间');
        }
        return json({room:roomState(await getRoom(code))});
      }
      if(action==='hit'&&method==='POST'){
        if(room.game!=='tap')fail(400,'此游戏不使用点格模式');
        const data=await body(request),cols=data.cols??[data.col],step=data.step,round=data.round,now=Date.now();
        if(!Array.isArray(cols)||cols.length<1||cols.length>32||cols.some(col=>!Number.isInteger(col)||col<0||col>3)||!Number.isInteger(step)||step<0||step+cols.length>300||!Number.isSafeInteger(round)||round<1)fail(400,'操作无效');
        if(round!==room.round)fail(409,'这次点击属于上一局');
        if(!room.starts_at||now<room.starts_at||now>room.starts_at+PK_DURATION_MS+1200)fail(409,'本局尚未开始或已经结束');
        const isHost=user.id===room.host_id,scoreColumn=isHost?'host_score':'guest_score',lastColumn=isHost?'host_last_hit':'guest_last_hit';
        const current=room[scoreColumn];
        if(step!==current)fail(409,'成绩已更新，请同步房间');
        if(!pkValidBatch(room.seed,current,cols))return json({correct:false,room:roomState(room)});
        const result=await run(`UPDATE pk_rooms SET ${scoreColumn}=${scoreColumn}+?,${lastColumn}=? WHERE code=? AND round=? AND ${scoreColumn}=? AND starts_at<=? AND starts_at+? >=?`,cols.length,now,code,round,current,now,PK_DURATION_MS+1200,now);
        if(!result.meta.changes)fail(409,'成绩已更新，请同步房间');
        room=await getRoom(code);
        return json({correct:true,room:roomState(room)});
      }
      if(action==='score'&&method==='POST'){
        if(room.game==='tap')fail(400,'点格模式需要逐次命中');
        const data=await body(request),value=data.score,seq=data.seq,round=data.round,now=Date.now();
        const caps={merge:1000000,flap:50,puzzle:1000000,aim:1000000};
        if(!Number.isSafeInteger(value)||value<0||value>caps[room.game]||!Number.isSafeInteger(seq)||seq<1||seq>10000||!Number.isSafeInteger(round)||round<1)fail(400,'成绩无效');
        if(round!==room.round)fail(409,'这份成绩属于上一局');
        if(!room.starts_at||now<room.starts_at||now>room.starts_at+PK_DURATION_MS+1200)fail(409,'本局尚未开始或已经结束');
        const isHost=user.id===room.host_id,scoreColumn=isHost?'host_score':'guest_score',seqColumn=isHost?'host_seq':'guest_seq';
        if(seq<=room[seqColumn])return json({ok:true,room:roomState(room)});
        await run(`UPDATE pk_rooms SET ${scoreColumn}=?,${seqColumn}=? WHERE code=? AND round=? AND ${seqColumn}<? AND starts_at<=? AND starts_at+? >=?`,value,seq,code,round,seq,now,PK_DURATION_MS+1200,now);
        return json({ok:true,room:roomState(await getRoom(code))});
      }
      fail(405,'请求方法不支持');
    }

    const detail=/^\/api\/(suggestions|topics)\/(\d+)$/.exec(path);
    if (detail && method==='GET') {
      const [,,rawId]=detail, id=Number(rawId), suggestion=detail[1]==='suggestions';
      const item=suggestion
        ? await first(`SELECT s.id,s.title,s.body,s.created_at AS createdAt,u.username,u.id AS userId,(SELECT count(*) FROM suggestion_votes v WHERE v.suggestion_id=s.id) AS votes,EXISTS(SELECT 1 FROM suggestion_votes v WHERE v.suggestion_id=s.id AND v.user_id=?) AS voted FROM suggestions s JOIN users u ON u.id=s.user_id WHERE s.id=?`,user?.id||-1,id)
        : await first(`SELECT t.id,t.title,t.body,t.created_at AS createdAt,u.username,u.id AS userId,(SELECT count(*) FROM replies r WHERE r.topic_id=t.id) AS replyCount FROM topics t JOIN users u ON u.id=t.user_id WHERE t.id=?`,id);
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
    if (replies && method==='GET') return json({items:await all('SELECT r.id,r.body,r.created_at AS createdAt,u.username,u.id AS userId FROM replies r JOIN users u ON u.id=r.user_id WHERE r.topic_id=? ORDER BY r.created_at ASC,r.id ASC LIMIT 200',Number(replies[1]))});
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
      if (method==='GET' && path==='/api/admin/users') return json({items:await all('SELECT id,public_id AS publicId,username,role,banned,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 200')});
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
