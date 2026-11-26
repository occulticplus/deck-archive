function configScript(value = 'http://localhost:3000') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API_BASE_URL 必须是无账号、查询参数或片段的 HTTP(S) 地址');
  return `window.SCOUT_CONFIG = ${JSON.stringify({apiBase:url.href.replace(/\/+$/,'')})};\n`;
}
module.exports = {configScript};
