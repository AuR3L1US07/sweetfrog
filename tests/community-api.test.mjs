import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('registration, guest permissions, unique votes, replies and rankings', async () => {
  const port = 43000 + Math.floor(Math.random() * 10000);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), SWEETFROG_DB: ':memory:', SWEETFROG_ADMIN_USER:'testadmin', SWEETFROG_ADMIN_PASSWORD:'localTestPassword456!' },
    stdio: 'ignore'
  });
  try {
    let started = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch(origin + '/api/session'); if (response.ok) { started = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(started, true, 'server started');
    assert.equal((await fetch(origin + '/server/server.mjs')).status, 403);
    assert.equal((await fetch(origin + '/data/sweetfrog.sqlite')).status, 403);
    const call = async (path, method = 'GET', data, token) => {
      const response = await fetch(origin + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      return [response.status, await response.json()];
    };
    assert.equal((await call('/api/suggestions', 'POST', { title:'Hi', body:'Idea' }))[0], 401);
    assert.equal((await call('/api/leaderboards/tap', 'POST', { score:10 }))[0], 401);
    const [code, registered] = await call('/api/register', 'POST', { username:'testfrog', password:'password123' });
    assert.equal(code, 200);
    const token = registered.token;
    assert.equal((await call('/api/register', 'POST', { username:'testfrog', password:'password123' }))[0], 409);
    assert.equal((await call('/api/login', 'POST', { username:'testfrog', password:'wrong-password' }))[0], 401);
    assert.equal((await call('/api/login', 'POST', { username:'testfrog', password:'password123' }))[0], 200);
    const [suggestionStatus,suggestionCreated] = await call('/api/suggestions', 'POST', { title:'More frogs', body:'Please add them' }, token);
    assert.equal(suggestionStatus,201);
    assert.equal((await call(`/api/suggestions/${suggestionCreated.id}`))[1].item.title,'More frogs');
    assert.equal((await call('/api/suggestions/999999'))[0],404);
    assert.deepEqual((await call('/api/suggestions/1/vote', 'POST', {}, token))[1], { ok:true, added:true });
    assert.deepEqual((await call('/api/suggestions/1/vote', 'POST', {}, token))[1], { ok:true, added:false });
    assert.equal((await call('/api/suggestions'))[1].items[0].votes, 1);
    const [topicStatus,topicCreated] = await call('/api/topics', 'POST', { title:'Tips', body:'How do you play?' }, token);
    assert.equal(topicStatus,201);
    assert.equal((await call(`/api/topics/${topicCreated.id}`))[1].item.title,'Tips');
    assert.equal((await call('/api/topics/999999'))[0],404);
    assert.equal((await call('/api/topics/1/replies', 'POST', { body:'Practice daily' }, token))[0], 201);
    assert.equal((await call('/api/topics/1/replies'))[1].items.length, 1);
    assert.equal((await call('/api/leaderboards/tap', 'POST', { score:20 }, token))[0], 200);
    assert.equal((await call('/api/leaderboards/tap', 'POST', { score:5 }, token))[1].self.score, 20);
    assert.equal((await call('/api/leaderboards/tap'))[1].entries[0].score, 20);
    assert.equal((await call('/api/admin/overview'))[0], 401);
    assert.equal((await call('/api/admin/overview', 'GET', undefined, token))[0], 403);
    const [adminStatus, admin] = await call('/api/login', 'POST', { username:'testadmin', password:'localTestPassword456!' });
    assert.equal(adminStatus, 200);
    assert.equal(admin.user.role, 'admin');
    const adminToken = admin.token;
    assert.equal((await call('/api/admin/overview', 'GET', undefined, adminToken))[1].suggestions, 1);
    const scoreUserId = (await call('/api/admin/leaderboards/tap', 'GET', undefined, adminToken))[1].items[0].userId;
    assert.equal((await call(`/api/admin/leaderboards/tap/${scoreUserId}`, 'DELETE', undefined, adminToken))[0], 200);
    assert.equal((await call('/api/leaderboards/tap'))[1].entries.length, 0);
    assert.equal((await call('/api/admin/topics/1', 'DELETE', undefined, adminToken))[0], 200);
    assert.equal((await call('/api/topics'))[1].items.length, 0);
    assert.equal((await call('/api/admin/suggestions/1', 'DELETE', undefined, adminToken))[0], 200);
    assert.equal((await call('/api/suggestions'))[1].items.length, 0);
    assert.equal((await call(`/api/admin/users/${scoreUserId}/ban`, 'POST', { banned:true }, adminToken))[0], 200);
    assert.equal((await call('/api/topics', 'POST', { title:'Blocked', body:'Blocked' }, token))[0], 401);
    assert.equal((await call('/api/login', 'POST', { username:'testfrog', password:'password123' }))[0], 403);
    assert.equal((await call(`/api/admin/users/${scoreUserId}/ban`, 'POST', { banned:false }, adminToken))[0], 200);
    assert.equal((await call('/api/logout', 'POST', {}, token))[0], 200);
    assert.equal((await call('/api/leaderboards/tap', 'POST', { score:30 }, token))[0], 401);
  } finally { child.kill(); }
});
