import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=resolve(import.meta.dirname,'..'),port=45000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','dev','dist','--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
let logs='',browser;
server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  assert.ok(ready,logs);
  browser=await chromium.launch({headless:true,channel:'msedge'});
  for(const [width,height,name] of [[1280,900,'desktop'],[390,844,'mobile']]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(base+'/#games');await page.locator('.game-card').first().waitFor();
    await page.screenshot({path:`tests/home-layout-${name}.png`,fullPage:true});
    const boxes=await page.locator('.game-card').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
    assert.equal(boxes.length,5);assert.ok(boxes.every(box=>box.width>130));
    if(width===1280){assert.equal(boxes[0].y,boxes[2].y);assert.equal(boxes[3].y,boxes[4].y);assert.ok(boxes[3].y>boxes[0].y);}
    else{assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[4].width>boxes[0].width);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
    await page.close();
  }
  console.log('PASS: balanced desktop and mobile game cards, no horizontal overflow');
}finally{await browser?.close();server.kill();}
