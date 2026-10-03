import test from 'node:test';
import assert from 'node:assert/strict';
import {insideTarget,hitPoints,summarizeAim,nextPosition} from '../aim-core.js';
test('only the circular target counts, not corners of its bounding square',()=>{const target={x:100,y:100,r:25};assert.equal(insideTarget(100,100,target),true);assert.equal(insideTarget(124,124,target),false);assert.equal(insideTarget(125,100,target),true);});
test('reaction bonus is bounded and rewards faster aim',()=>{assert.equal(hitPoints(0),200);assert.equal(hitPoints(2),100);assert.ok(hitPoints(.2)>hitPoints(1));});
test('empty rounds and misses do not create NaN statistics',()=>{assert.deepEqual(summarizeAim(0,0,0,0),{accuracy:0,reaction:null,hits:0,shots:0,bestCombo:0});assert.equal(summarizeAim(3,4,1.5,2).accuracy,75);assert.equal(summarizeAim(3,4,1.5,2).reaction,500);});
test('random targets stay within desktop and mobile safe areas',()=>{for(const [w,h]of [[1000,562],[286,357]])for(let i=0;i<100;i++){const p=nextPosition(w,h,34,{x:w/2,y:h/2});assert.ok(p.x>=50&&p.x<=w-50);assert.ok(p.y>=50&&p.y<=h-50);}});
