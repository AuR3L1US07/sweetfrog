import { communityBackend } from './community-config.js';

export async function communityRequest(path, options = {}, token = '') {
  if (communityBackend.provider === 'firebase') {
    const { firebaseRequest } = await import('./firebase-adapter.js');
    return firebaseRequest(path, options, token);
  }
  if (communityBackend.provider !== 'node') throw Error('社区数据源配置无效。');
  let response;
  try {
    response = await fetch(communityBackend.apiBaseUrl + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
  } catch { throw Error('服务器尚未连接，稍后再试。'); }
  let data;
  try { data = await response.json(); } catch { throw Error('服务器尚未连接，稍后再试。'); }
  if (!response.ok) throw Error(data.error || '请求失败');
  return data;
}
