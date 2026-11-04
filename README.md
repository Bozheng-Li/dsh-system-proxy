# dsh-system-proxy

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）直接复用 Windows 系统代理。无需 TUN。

支持 Windows 10/11、DSH `0.2.1-rc.2` 至 `0.3.0` 之前的版本。

## 安装

在 DSH「插件 → 添加插件」中输入：

```text
dsh-system-proxy@0.1.1
```

安装后完全退出并重新打开 DSH。

也可以使用命令行：

```powershell
dsh plugin --profile desktop add dsh-system-proxy
```

## 使用

在代理软件中开启“系统代理”，保持 TUN 关闭。插件会自动读取 Windows 当前用户的 HTTP 代理设置。

覆盖模型请求、Web Search、HTTP MCP，以及 pnpm、git 等 DSH 子进程。Electron 登录和更新流量不保证覆盖。

## 配置

默认 `auto` 跟随系统代理，无需额外配置。需要固定代理时，编辑 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`：

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

| mode | 行为 |
| --- | --- |
| `auto` | 跟随 Windows 系统代理，默认 |
| `manual` | 固定使用 `proxyUrl` |
| `off` | 禁用代理 |

显式 `HTTP_PROXY` / `HTTPS_PROXY` 优先于系统设置。PAC/WPAD 不支持；SOCKS 请使用代理软件提供的 HTTP 或 mixed 端口。

## 排障

启动日志出现下面这行，表示代理已接管：

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

没有生效时，依次检查：

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

确认系统代理已开启、端口可连接、DSH 已完全重启，并且当前 profile 是 `desktop`。

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

然后重启 DSH。

MIT License · [English](README.en.md)
