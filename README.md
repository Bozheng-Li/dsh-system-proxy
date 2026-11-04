# dsh-system-proxy

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）复用 Windows 系统代理。代理软件只开“系统代理”和 HTTP 端口，不需要为 DSH 常开 TUN。

仅支持 Windows 10/11、DSH `0.2.1-rc.2` 至 `0.3.0` 之前的版本。

## 安装

当前还没发布到 npm。用 GitHub URL 安装：

```powershell
# dsh 在 PATH 中
dsh plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"

# 桌面版自带的 CLI
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"
```

安装后**完全退出并重启 DSH**。然后在代理软件里开启系统代理，例如 `127.0.0.1:7897`，保持 TUN 关闭。

插件使用 undici 安装进程级全局 dispatcher，覆盖 DSH 内使用 Node `fetch()` 的模型请求、Web Search 和 HTTP MCP。Electron 的登录/更新网络不保证覆盖。

## 配置

默认跟随 Windows 系统代理，不需要写配置。需要固定代理时，编辑：

`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

模式：

| mode | 行为 |
| --- | --- |
| `auto` | 跟随 Windows 系统代理；默认 |
| `manual` | 固定使用 `proxyUrl` |
| `off` | 不使用插件代理 |

显式 `HTTP_PROXY` / `HTTPS_PROXY` 优先于 Windows 设置。PAC/WPAD 不支持；请用 `manual`。SOCKS 也不能直接作为系统代理 URL，请使用代理软件的 HTTP 或 mixed 端口。

## 验证

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

DSH 启动日志出现下面这一行即表示已接管：

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

没有生效时依次确认：系统代理确实开启、端口在监听、DSH 已完全重启、当前 profile 是 `desktop`、没有被 `HTTP(S)_PROXY` 覆盖。

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

然后重启 DSH。

## 开发

```powershell
pnpm install
pnpm test
pnpm pack --pack-destination .
```

MIT License · [English](README.en.md)
