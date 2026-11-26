# 赛场笔记 / MTG Scout

无需构建、无第三方依赖的静态 Web 前端，适合 GitHub Pages。运行 `node serve.cjs`，访问 http://127.0.0.1:5173。

## 当前功能

- 首次填写汇报人姓名，localStorage 记住身份、比赛与后端配置；下次使用无需重复填写。姓名随每次提交发送。这是自报身份，不是认证，不能防止冒用。
- 录入自己的对手：比赛、轮数、可选桌号、姓名、套牌、备注。保存成功保留轮数，清空对手字段；失败保留输入。
- 按比赛、轮数和关键词查询，手动刷新共享数据。
- 可配置后端（默认 http://localhost:3000），以及独立的本机演示模式。演示数据不发送服务器。
- 现场观察暂不实现，未来采用独立标签式记录，不复用对手必填结构。

## 后端接口约定

所有响应使用 JSON。Endpoint 可以包含路径前缀，例如 https://api.example.com/v1。前端不发送认证 Cookie，也不要求登录接口。

### POST /records

请求：
```json
{"eventId":"2026 上海公开赛","round":3,"table":128,"opponent":"张三","deck":"铁木尔灵技","notes":"观察到备牌反击咒语","reporter":{"name":"李四"},"source":"opponent"}
```

成功返回 201 和 JSON 对象，例如 `{"id":"record-123"}`。服务端生成唯一 ID 和 createdAt；必须验证字段，不能信任客户端自报姓名。round 为 1–99 整数，table 为 null 或 1–99999 整数；eventId、opponent、deck 最多 100 字符；reporter.name 最多 80 字符；notes 最多 2000 字符。

### GET /records?eventId=...&q=...&round=3

eventId 必填且精确匹配；q 搜索姓名、套牌、备注；round 可选。返回按创建时间倒序排列的完整匹配列表：
```json
{"items":[{"id":"record-123","eventId":"2026 上海公开赛","round":3,"table":128,"opponent":"张三","deck":"铁木尔灵技","notes":"观察到备牌反击咒语","reporter":{"name":"李四"},"source":"opponent","createdAt":"2026-11-26T08:00:00Z"}]}
```

当前版本未实现分页。大量数据时需一起升级查询接口与前端。团队成员必须使用相同比赛名称，后续可以替换为后端统一的比赛 ID。

## 跨域和部署

后端需允许前端实际 Origin（开发时 http://127.0.0.1:5173，线上为 https://用户名.github.io），处理 OPTIONS 预检，允许 GET、POST 和 Content-Type 请求头。线上后端应提供 HTTPS。localhost 指访问者自己的电脑，不是共享服务器；仅用于开发。浏览器可能要求本地网络访问授权，生产环境应改为实际服务器地址。

本版身份只使用 localStorage，不需要 Cookie。清除站点数据、无痕窗口或更换浏览器会失去身份。localStorage 按 Origin 隔离，不按 GitHub 仓库路径隔离；同一 GitHub Pages 域名的其他应用能访问同源存储。不要在这里存放密码或密钥。

## GitHub Pages

将项目推送到 GitHub 仓库 main 分支，在 Settings → Pages → Source 选择 GitHub Actions。仓库提供 `.github/workflows/pages.yml`，仅发布 index.html、style.css 和 app.js。资源采用相对路径，兼容项目子路径。未创建远端仓库，也未发布。

## 验证

`npm test` 执行前端逻辑和真实 HTTP / SQLite 集成测试，覆盖身份、录入、查询、并发汇报、数据隔离、重启持久化、参数校验和跨域。浏览器视觉验收尚未完成。

## 启动前后端

需要 Node.js 24 或更高版本，无需安装第三方依赖。在两个终端分别运行：

```sh
npm start
npm run frontend
```

打开 http://127.0.0.1:5173，选择“后端共享模式”，Endpoint 填写 http://localhost:3000，设置汇报人和比赛名称即可使用。健康检查：http://localhost:3000/health。

数据库默认保存到 `backend/data/scout.sqlite`。同一个后端实例的所有用户共享数据库；比赛名称用于筛选，不是权限边界。当前按用户要求采用自报身份，没有账号认证，能够访问 API 的人可以读写；CORS 仅控制浏览器跨域，不是访问认证。

## 服务器部署

后端可以单独部署，服务器不需要托管前端。推荐使用提供的 Docker Compose：

1. 将项目复制到服务器，在项目目录创建 `.env`：
   ```env
   ALLOWED_ORIGINS=https://你的用户名.github.io
   ```
   Origin 不包含仓库路径或末尾斜杠。多个前端来源以逗号分隔。
2. 执行 `docker compose up -d --build`。服务监听服务器本机 3000 端口，数据库保存在持久化卷 `scout-data`。
3. 用服务器已有的 HTTPS 反向代理，将 API 域名转发到 `127.0.0.1:3000`。例如 Caddy 配置：
   ```text
   api.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
   将域名 DNS 指向服务器，并开放 HTTPS 所需端口。若代理也运行在容器中，应使用共享网络和 `api:3000`，不要使用代理容器自身的 localhost。
4. 在 GitHub Pages 前端的“连接与身份”中，将 Endpoint 改为 `https://api.example.com`。

也可直接运行 Node，并由 systemd 等进程管理器托管。支持环境变量：`PORT`（默认 3000）、`HOST`（默认 0.0.0.0）、`DB_PATH`（数据库文件路径）、`ALLOWED_ORIGINS`（逗号分隔来源）。直接运行 Node 时由进程管理器设置环境变量；它不会自动加载 `.env`。若使用 API 路径前缀，反向代理须先去掉前缀再转发。

SQLite 适合当前单服务器多人录入场景；不要把数据库放在网络共享目录，也不要将多个容器副本挂载到同一 SQLite 文件。备份时停止服务并备份数据目录/卷，再启动；不要只复制运行中的主数据库文件，WAL 文件可能尚未合并。`docker compose down` 保留数据；`docker compose down -v` 会删除数据卷。

容器配置已提供，但当前环境未执行 Docker 构建。后端通过本机真实 HTTP 测试；尚未部署至远端服务器。
