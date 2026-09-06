# dsh-xai-oauth

Native xAI（Grok / X 订阅）OAuth 登录插件 for DeepSeek Harness。

用 SuperGrok 或 X Premium 订阅登录 xAI，**不需要 API key**。插件完成 xAI
设备码（RFC 8628 device-code）授权，把 access token 注入 DSH 凭据
（`XAI_OAUTH_TOKEN`），并在 token 接近过期时用 refresh token 自动续期，
让 `llm-pi-ai` 的 `xai` provider 路由每次请求都能拿到有效令牌。

## 安装

从 npm 安装（推荐）：

```sh
dsh plugin --profile web add dsh-xai-oauth
```

或从 GitHub 安装：

```sh
dsh plugin --profile web add github:tonylee2022/dsh-xai-oauth
```

本地源码安装（开发调试用）：

```sh
dsh plugin --profile web add ./dsh-xai-oauth
```

然后重启 web profile（`dsh --profile web`）。重启后在 **设置 → 模型提供方**
旁会出现 **xAI（Grok/X）** 设置页：点击“登录 xAI”→ 复制用户码 →
点“打开授权页”在 xAI 官方页面登录并批准 → 自动完成授权。

登录后，侧边栏左下角 **设置按钮右侧** 会显示紧凑的 **订阅用量** 芯片（已用百分比
与额度）；左键点击刷新用量，右键点击打开设置详情页。

## 原理

1. 插件向 `https://auth.x.ai/oauth2/device/code` 申请设备码（客户端 id 与
   scope 与 xAI CLI / pi-ai 一致，scope 含 `grok-cli:access api:access`）。
2. 轮询 `https://auth.x.ai/oauth2/token` 直到用户批准，得到
   access token + refresh token，原子写入 `$DSH_HOME/xai-oauth.json`
   （0600 / 0700）。
3. 通过 `ctx.credentials` 把当前 access token 写入 `XAI_OAUTH_TOKEN`；
   bundle patch 给 `llm-pi-ai` 的 `xai` 路由配置
   `apiKeyEnv: XAI_OAUTH_TOKEN`，每次请求解析最新值。
4. 每 60 秒检查一次，距过期不足 5 分钟时用 refresh token 续期并重新写入。

## 配置（可选）

```yaml
- id: xai-oauth
  config:
    path: /secure/path/xai-oauth.json   # 默认 $DSH_HOME/xai-oauth.json
    controlPort: 1457                    # 本机状态服务端口
```

## 安全边界

- 令牌只保存在 Host 侧文件（owner-only 权限）；Web 页面不接触令牌。
- 本机控制服务只监听 `127.0.0.1:1457`，仅接受本地 DSH Web origin；
  登出请求带 CSRF token。
- access token 等效于该订阅的 API 凭据，请勿外泄。

## License

MIT