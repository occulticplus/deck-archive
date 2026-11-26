const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createApp } = require('./server.cjs');
test('HTTP API: persistence, filters, validation, CORS and concurrent reporters', async () => {
  const dir = mkdtempSync(join(tmpdir(),'scout-test-'));
  let server;
  async function start() { server=createApp({dbPath:join(dir,'test.sqlite')}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); return `http://127.0.0.1:${server.address().port}`; }
  async function stop() { await new Promise(resolve=>server.close(resolve)); }
  try {
    let base=await start();
    const createEvent=async name=>(await fetch(base+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})).json();
    const first=await createEvent('公开赛'),second=await createEvent('另一比赛');
    const payload={eventId:first.id,round:3,table:null,opponent:'张三',deck:'Control',notes:'备牌 100% _',reporter:{name:'李四'},source:'opponent'};
    const post=(body,headers={})=>fetch(base+'/records',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    const response=await post(payload);assert.equal(response.status,201);const saved=await response.json();assert.ok(saved.id);assert.ok(saved.createdAt);assert.equal(saved.reporter.name,'李四');
    await Promise.all(Array.from({length:8},(_,i)=>post({...payload,round:4,reporter:{name:'队友'+i}}).then(r=>assert.equal(r.status,201))));
    await post({...payload,eventId:second.id});
    const query=async suffix=>(await fetch(base+'/records?eventId='+encodeURIComponent(first.id)+suffix)).json();
    assert.equal((await query('')).items.length,9);assert.equal((await query('&round=3&q=control')).items.length,1);assert.equal((await query('&q=%25')).items.length,9);assert.equal((await query('&q=unknown')).items.length,0);
    for(const change of [{round:0},{round:1.5},{round:'3'},{opponent:' '},{reporter:{}},{source:'observation'},{notes:'x'.repeat(2001)},{table:-1}])assert.equal((await post({...payload,...change})).status,400);
    assert.equal((await fetch(base+'/records')).status,400);
    assert.equal((await post(payload,{Origin:'https://evil.example'})).status,403);
    const preflight=await fetch(base+'/records',{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:5173');
    assert.equal((await fetch(base+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await fetch(base+'/events')).status,200);
    assert.equal((await fetch(base+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'公开赛'})})).status,409);
    assert.equal((await post({...payload,eventId:'missing'})).status,404);
    await stop();base=await start();assert.equal((await query('')).items.length,9);
  } finally { if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true}); }
});

