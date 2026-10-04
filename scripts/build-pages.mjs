import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist');
await rm(out, { recursive:true, force:true });
await mkdir(out, { recursive:true });
for (const file of ['index.html','admin.html','styles.css','theme.css','community.css','admin.css','admin.js','app.js','aim.js','core.js','community.js','community-transport.js','community-config.js','firebase-config.js','firebase-adapter.js']) {
  await copyFile(join(root,file),join(out,file));
}
await cp(join(root,'assets'),join(out,'assets'),{recursive:true});
console.log(`Built static Pages site in ${out}`);

await copyFile(join(root,'cloudflare','_routes.json'),join(out,'_routes.json'));
