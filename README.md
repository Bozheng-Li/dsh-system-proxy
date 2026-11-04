<div align="center">

# DSH System Proxy

**让 DeepSeek Harness 直接复用 Windows 系统代理。**

系统代理开启，TUN 保持关闭。模型请求、插件安装和开发工具走同一条网络路径。

[![npm](https://img.shields.io/npm/v/dsh-system-proxy?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/dsh-system-proxy)
[![CI](https://img.shields.io/github/actions/workflow/status/Bozheng-Li/dsh-system-proxy/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Bozheng-Li/dsh-system-proxy/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/Bozheng-Li/dsh-system-proxy?style=flat-square)](LICENSE)
![Windows](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-1679A7?style=flat-square&logo=windows)

</div>

---

```text
Windows WinINET ──> System Proxy ──> DSH / undici / child processes
                         │
                         └── TUN: not required
```

| 不用配置代理地址 | 不接管系统网络 | 安装工具同样生效 |
| :--- | :--- | :--- |
| 自动读取当前用户的 Windows HTTP 代理 | 不改路由、不创建虚拟网卡、不开放监听端口 | 模型请求、Web Search、HTTP MCP、pnpm 与 git 共用代理 |

## 安装

DSH **0.2.1-rc.2** 至 **0.3.0** 之前的版本，Windows 10/11。

在「插件 → 添加插件」中输入：

```text
dsh-system-proxy@0.1.1
```

安装完成后**完全退出并重新打开 DSH**。

<details>
<summary><b>命令行安装</b></summary>

```powershell
# dsh 在 PATH 中
dsh plugin --profile desktop add dsh-system-proxy

# 使用桌面版自带的 CLI
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add dsh-system-proxy
```

也可以直接从 GitHub 安装：

```powershell
dsh plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"
```

</details>

## 启用

1. 打开代理软件的 **系统代理**
2. 保持 **TUN 关闭**
3. 重启 DSH

插件在启动时读取 Windows 当前用户的 WinINET 设置，默认不需要填写 IP 或端口。

> DSH 是运行在 Electron 中的宿主。插件覆盖 Node.js/undici 请求及 DSH 派生的子进程；Electron 自身负责的登录与更新流量不保证覆盖。

## 配置

默认配置已经覆盖大多数场景：

```yaml
mode: auto
useWindowsBypass: true
```

需要固定代理时，在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 中加入：

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

<details>
<summary><b>配置项与优先级</b></summary>

| 配置 | 说明 |
| :--- | :--- |
| `mode: auto` | 跟随 Windows 系统代理，默认 |
| `mode: manual` | 始终使用 `proxyUrl` |
| `mode: off` | 不应用插件代理 |
| `useWindowsBypass` | 合并 Windows 绕过列表，默认 `true` |

优先级从高到低：显式 `HTTP_PROXY` / `HTTPS_PROXY` → 插件配置 → Windows 系统代理。

PAC/WPAD 不支持。SOCKS 请填写代理软件提供的 HTTP 或 mixed 端口。

</details>

## 验证

启动日志出现下面这一行，说明插件已经接管：

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

检查 Windows 设置和代理端口：

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

如果未生效，依次确认：系统代理已开启、端口正在监听、DSH 已完全退出并重启、当前 profile 是 `desktop`、没有被显式代理环境变量覆盖。

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

重启 DSH。

---

<div align="center">

[English](README.en.md) · [Issues](https://github.com/Bozheng-Li/dsh-system-proxy/issues) · [Releases](https://github.com/Bozheng-Li/dsh-system-proxy/releases)

MIT License

</div>
