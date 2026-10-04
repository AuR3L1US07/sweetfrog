import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('existing player rows receive distinct five-digit IDs without changing their keys',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT);');
    for(let i=1;i<=30;i++)db.prepare('INSERT INTO users(id,username) VALUES(?,?)').run(i,`player${i}`);
    db.exec(readFileSync(new URL('../cloudflare/player-id-migration.sql',import.meta.url),'utf8'));
    const rows=db.prepare('SELECT id,public_id AS publicId FROM users ORDER BY id').all();
    assert.deepEqual(rows.map(row=>row.id),Array.from({length:30},(_,index)=>index+1));
    assert.equal(new Set(rows.map(row=>row.publicId)).size,30);
    assert.ok(rows.every(row=>row.publicId>=10000&&row.publicId<=99999));
  }finally{db.close();}
});
