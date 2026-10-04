import { firebaseConfig } from './firebase-config.js';

// Implement this request-shaped adapter when Firebase is configured.
// community.js and admin.js depend on these API paths, not on a storage SDK:
// /api/session, /api/register, /api/login, /api/logout,
// /api/suggestions, /api/suggestions/:id/vote,
// /api/topics, /api/topics/:id/replies,
// /api/leaderboards/:game, and /api/admin/*.
// Keep authentication, unique votes and admin authorization in Firebase rules
// or trusted server functions; UI checks alone do not enforce them.
export async function firebaseRequest(_path, _options, _token) {
  if (!firebaseConfig.projectId) throw Error('Firebase 项目尚未配置。');
  throw Error('Firebase 适配器尚未启用；当前请使用 Node 服务。');
}
