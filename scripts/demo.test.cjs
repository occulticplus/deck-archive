const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('demo persists events and records across reloads and isolates query results', async () => {
  const storage = new Map();
  const open = () => {
    const ctx = vm.createContext({window: {}, URL, crypto: require('node:crypto').webcrypto,
      localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)}});
    vm.runInContext(fs.readFileSync('scripts/demo.js','utf8'), ctx);
    return ctx.window.scoutDemoApi;
  };
  let api = open();
  const post = body => ({method: 'POST', body: JSON.stringify(body)});
  const a = await api('/events', post({name:'比赛甲'}));
  const b = await api('/events', post({name:'比赛乙'}));
  await api('/records', post({eventId:a.id, round:3, opponent:'选手甲', deck:'控制', notes:'备牌', reporter:{name:'我'}}));
  await api('/records', post({eventId:b.id, round:3, opponent:'选手乙', deck:'控制'}));
  api = open();
  assert.equal((await api('/events')).items.length, 2);
  assert.equal((await api(`/records?eventId=${a.id}&q=控制&round=3`)).items[0].opponent, '选手甲');
  assert.equal((await api(`/records?eventId=${a.id}&round=2`)).items.length, 0);
  await assert.rejects(api('/records',post({eventId:a.id,round:0})),/轮数/);
});
