const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function string(value, name, max, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) throw invalid(`${name} 必须是${max}字以内的${optional ? '' : '非空'}字符串`);
  return value.trim();
}
function integer(value, name, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw invalid(`${name} 必须是 1–${max} 的整数`);
  return value;
}
function createApp({ dbPath = resolve(__dirname, 'data/scout.sqlite'), origins = ['http://localhost:5173', 'http://127.0.0.1:5173'] } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, round INTEGER NOT NULL,
      table_number INTEGER, opponent TEXT NOT NULL, deck TEXT NOT NULL,
      notes TEXT NOT NULL, reporter_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_event_round ON records(event_id, round);
    CREATE INDEX IF NOT EXISTS records_event_time ON records(event_id, created_at DESC);`);
  db.exec(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    INSERT OR IGNORE INTO events SELECT event_id, event_id, MIN(created_at) FROM records GROUP BY event_id;`);
  const insert = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const list = db.prepare(`SELECT * FROM records WHERE event_id = ? AND (? IS NULL OR round = ?)
    AND (? = '' OR instr(lower(opponent || ' ' || deck || ' ' || notes), lower(?)) > 0)
    ORDER BY created_at DESC, rowid DESC`);
  function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Vary', 'Origin');
    try {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) throw invalid('此来源不在允许列表中', 403);
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      const url = new URL(req.url, 'http://localhost');
      if (!['/health', '/records', '/events'].includes(url.pathname)) throw invalid('接口不存在', 404);
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.writeHead(204); res.end(); return;
      }
      if (url.pathname === '/health' && req.method === 'GET') { db.prepare('SELECT 1').get(); send(res, 200, { status: 'ok' }); return; }
      if (url.pathname === '/events' && req.method === 'GET') {
        send(res, 200, {items:db.prepare('SELECT id, name, created_at AS createdAt FROM events ORDER BY created_at DESC, rowid DESC').all()}); return;
      }
      if (url.pathname === '/records' && req.method === 'GET') {
        const event = string(url.searchParams.get('eventId'), 'eventId', 100);
        const q = string(url.searchParams.get('q') ?? '', 'q', 2000, true);
        const rawRound = url.searchParams.get('round');
        if (rawRound !== null && !/^\d+$/.test(rawRound)) throw invalid('round 必须是整数');
        const round = rawRound === null ? null : integer(Number(rawRound), 'round', 99);
        const items = list.all(event, round, round, q, q).map(r => ({ id:r.id, eventId:r.event_id, round:r.round, table:r.table_number, opponent:r.opponent, deck:r.deck, notes:r.notes, reporter:{name:r.reporter_name}, source:'opponent', createdAt:r.created_at }));
        send(res, 200, { items }); return;
      }
      if (['/records', '/events'].includes(url.pathname) && req.method === 'POST') {
        if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw invalid('请求必须使用 application/json', 415);
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 32768) throw invalid('请求内容过大', 413); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid('JSON 格式错误'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('请求必须是 JSON 对象');
        if (url.pathname === '/events') {
          const name = string(body.name, 'name', 100);
          if (db.prepare('SELECT id FROM events WHERE name = ?').get(name)) throw invalid('同名比赛已存在，请返回列表选择', 409);
          const event = {id:randomUUID(), name, createdAt:new Date().toISOString()};
          db.prepare('INSERT INTO events VALUES (?, ?, ?)').run(event.id,event.name,event.createdAt);
          send(res,201,event); return;
        }
        if (body.source !== 'opponent') throw invalid('目前仅支持自己的对手记录');
        const record = { id:randomUUID(), eventId:string(body.eventId,'eventId',100), round:integer(body.round,'round',99), table:body.table == null ? null : integer(body.table,'table',99999), opponent:string(body.opponent,'opponent',100), deck:string(body.deck,'deck',100), notes:string(body.notes,'notes',2000,true), reporter:{name:string(body.reporter?.name,'reporter.name',80)}, source:'opponent', createdAt:new Date().toISOString() };
        if (!db.prepare('SELECT id FROM events WHERE id = ?').get(record.eventId)) throw invalid('比赛不存在，请先选择或新增比赛', 404);
        insert.run(record.id, record.eventId, record.round, record.table, record.opponent, record.deck, record.notes, record.reporter.name, record.createdAt);
        send(res, 201, record); return;
      }
      res.setHeader('Allow', url.pathname === '/health' ? 'GET, OPTIONS' : 'GET, POST, OPTIONS');
      throw invalid('请求方法不支持', 405);
    } catch (error) {
      if (!error.status) console.error('Request failed:', error);
      if (!res.destroyed && !res.headersSent) send(res, error.status || 500, { error: { message: error.status ? error.message : '服务器内部错误' } });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => db.close());
  return server;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 无效');
  const server = createApp({ dbPath:process.env.DB_PATH || resolve(__dirname,'data/scout.sqlite'), origins:(process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim()).filter(Boolean) });
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Scout API listening on port ${port}`));
  server.on('error', error => { console.error(error.message); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); setTimeout(()=>process.exit(1),10000).unref(); });
}
module.exports = { createApp };
