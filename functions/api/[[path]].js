import { handleApi } from '../../cloudflare/api.js';
export async function onRequest({ request, env }) {
  return handleApi(request, env);
}
