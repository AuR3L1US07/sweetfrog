import { mkdir, cp, copyFile, rm, readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist');
await rm(out, { recursive:true, force:true });
await mkdir(out, { recursive:true });
for (const file of ['index.html','admin.html','styles.css','theme.css','hero-play.css','community.css','admin.css','admin.js','app.js','hero-play.js','aim.js','aim-core.js','core.js','community.js','community-transport.js','community-config.js','firebase-config.js','firebase-adapter.js']) {
  await copyFile(join(root,file),join(out,file));
}
await cp(join(root,'assets'),join(out,'assets'),{recursive:true});
console.log(`Built static Pages site in ${out}`);

await copyFile(join(root,'cloudflare','_routes.json'),join(out,'_routes.json'));

// A missing module is otherwise served as HTML by Pages and prevents all games from loading.
for (const file of (await readdir(out)).filter(name => name.endsWith('.js'))) {
  const source = await readFile(join(out,file),'utf8');
  const imports = source.matchAll(/(?:from\s*|import\(\s*)[\"'](\.\/[^\"']+)[\"']/g);
  for (const [,specifier] of imports) {
    const target = specifier.split('?')[0];
    try { await access(join(out,target)); }
    catch { throw Error(`Missing module ${target} imported by ${file}`); }
  }
}
