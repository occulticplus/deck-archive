const fs = require('node:fs');
const {configScript} = require('./config.cjs');
const demo = process.env.DEMO_MODE === 'true';
if (!demo && !process.env.API_BASE_URL) throw new Error('请设置 API_BASE_URL 后再构建发布文件');
const config = demo ? 'window.SCOUT_CONFIG = { mode: "demo" };\n' + fs.readFileSync('scripts/demo.js','utf8') : configScript(process.env.API_BASE_URL);
fs.mkdirSync('dist',{recursive:true});
for (const file of ['index.html','style.css','app.js']) fs.copyFileSync(file,`dist/${file}`);
fs.writeFileSync('dist/config.js',config);
if (demo) {
  let html = fs.readFileSync('dist/index.html','utf8');
  html = html.replace('<main>', '<main><p class="hint" role="note">本机演示版 · 比赛与情报仅保存在当前浏览器，不会上传或与队友共享。清除浏览器数据会删除记录。</p>')
    .replaceAll('后端模式','本机演示').replaceAll('共享情报库','本机情报库')
    .replaceAll('团队情报','本机情报').replaceAll('团队记录','本机记录')
    .replace('记录对局，汇集观察。让团队的赛场情报同步在一处。','记录对局，汇集观察。在当前浏览器体验录入与查询。');
  fs.writeFileSync('dist/index.html',html);
}
