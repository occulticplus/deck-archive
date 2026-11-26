const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {configScript} = require('./scripts/config.cjs');
const runtimeConfig = configScript(process.env.API_BASE_URL);
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};
http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(runtimeConfig);return;}const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end('Not found');return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');fs.createReadStream(path.join(__dirname,file)).pipe(res);}).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));

