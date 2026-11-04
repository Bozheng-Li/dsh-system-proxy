<div align="center">

# dsh-system-proxy

**让 DeepSeek Harness 直接复用 Windows 系统代理，不再为模型请求常开 TUN。**

[![CI](https://github.com/Bozheng-Li/dsh-system-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/Bozheng-Li/dsh-system-proxy/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-system-proxy?logo=npm)](https://www.npmjs.com/package/dsh-system-proxy)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4f46e5)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f766e.svg)](LICENSE)

[快速开始](#快速开始) · [工作原理](#工作原理) · [配置](#配置) · [故障排查](#故障排查) · [English](README.en.md)

</div>

> [!IMPORTANT]
> 这是一个 Windows 专用 DSH host 插件。它读取 Windows 当前用户的 **WinINET 固定系统代理**，并通过 DSH 官方 `@deepseek-ai/dsh-http-proxy` 安装进程级出站策略。它不是系统级 VPN，也不是 TUN 的替代品。

## 为什么需要它

Clash Verge、Mihomo、v2rayN 等工具开启“系统代理”后，浏览器和部分桌面应用会自动使用代理，但 Node.js 的 `fetch()` 默认不会读取 Windows 系统代理。DSH 的模型、搜索和 MCP 请求主要走 Node 网络栈，因此会出现：

- 浏览器能打开外网，DSH 请求却超时；
- 只有打开 TUN/虚拟网卡才能正常使用模型；
- 已经在环境变量里设了代理，但每个终端或每次启动都要重新配置。

`dsh-system-proxy` 把 Windows 的代理开关接到 DSH 的官方出站策略上。代理软件只开系统代理，DSH 重启后即可使用。

## 特性

- **跟随系统开关**：以 `ProxyEnable` 为准，不在系统代理关闭时偷偷启用注册表里残留的代理地址。
- **复用官方链路**：调用 DSH 自带的 undici dispatcher 安装器，不另造一套网络层。
- **覆盖常见请求**：使用 Node 全局 `fetch()` 的模型 SDK、Web Search、HTTP MCP 等请求共享同一策略。
- **子进程继承**：DSH 管理的子进程通过官方 `proxyEnvironmentForChild()` 获得同源代理配置。
- **安全绕过**：`localhost`、`127.0.0.0/8`、`::1` 始终直连，避免本地 Web UI 和开发服务形成代理回环。
- **可预测的优先级**：显式 `HTTP_PROXY` / `HTTPS_PROXY` 优先；手动模式可完全指定地址。
- **可诊断**：对 PAC/WPAD、无效 URL、权限和代理不可用给出明确结果，而不是静默失败。
- **可卸载**：插件 effect 卸载时恢复原有 dispatcher，不会污染后续 DSH 生命周期。
- **可测试**：不依赖外网即可跑完单测，并包含真实本地 HTTP 代理的端到端路由测试。

## 快速开始

### 前置条件

- Windows 10/11
- DeepSeek Harness `>= 0.2.1-rc.2 < 0.3.0`
- 一个 HTTP 或 HTTPS 代理端口，例如 Clash/Mihomo 的 `127.0.0.1:7897`

> 大多数代理软件同时提供 SOCKS 端口和 HTTP 端口。DSH 的官方策略只接受 HTTP(S) 代理 URL，GitHub 上的 DSH 插件体系目前也不直接接受 SOCKS URL。

### 安装

在 GitHub 发布页或 npm 安装：

```powershell
# 推荐：安装已发布版本
dsh plugin --profile desktop add dsh-system-proxy

# 也可以从当前源码目录安装
dsh plugin --profile desktop add "E:\path\to\dsh-system-proxy"

# 或者从 tarball 安装
dsh plugin --profile desktop add "E:\path\to\dsh-system-proxy-0.1.0.tgz"
```

如果 `dsh` 不在 PATH 中，直接调用桌面版自带 CLI：

```powershell
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add dsh-system-proxy
```

安装完成后**完全退出 DSH 进程**，再重新启动。仅刷新页面不会重新加载 host 插件。

### 开启系统代理

这里以 Clash Verge / Mihomo 为例：

1. 打开代理软件，启用 **系统代理**。
2. 确认代理监听端口，例如 `127.0.0.1:7897`。
3. 保持 TUN 关闭。
4. 重启 DSH。

```text
[代理软件] 系统代理 ON
        │
        ▼
Windows WinINET: 127.0.0.1:7897
        │
        ▼
dsh-system-proxy (DSH host)
        │
        ▼
@deepseek-ai/dsh-http-proxy
        │
        ▼
Node fetch / LLM / Search / MCP / managed subprocesses
```

## 工作原理

DSH 启动时已经在 `@deepseek-ai/dsh-http-proxy` 中安装了一份基于启动环境变量的全局策略。插件在 host 阶段读取 Windows 当前用户的 WinINET 设置，构造一个覆盖了系统代理的 launch environment，再调用同一个官方安装器。

这意味着：

1. 不需要修改 `app.asar`；
2. 不需要启动额外的本地代理转发进程；
3. 不会把代理实现和具体 SDK 绑定；
4. 插件卸载时可以恢复旧 dispatcher；
5. 系统代理关闭时，不会凭残留的 `ProxyServer` 值开启代理。

### 覆盖范围

| 请求类型 | 是否覆盖 | 说明 |
| --- | --- | --- |
| 模型 API（Node `fetch` / SDK） | 是 | 使用 DSH 全局 undici dispatcher |
| Web Search | 是 | 走 DSH host 网络 |
| HTTP MCP | 是 | 使用全局出站策略 |
| DSH 管理的 shell/子进程 | 是 | DSH 官方子进程环境会传播代理变量 |
| Electron 登录/自动更新 | 不保证 | 这是 Chromium 网络栈，不等同于 DSH Node 请求 |
| 任意系统应用 | 否 | 本插件不改变操作系统全局网络 |

> 如果你需要让 DSH 的 Electron 壳自身登录/更新也强制走代理，那是另一个 Chromium session 层的问题，不属于这个插件的职责。

## 配置

默认配置：

```yaml
- id: system-proxy
  config:
    mode: auto
    proxyUrl: ""
    useWindowsBypass: true
```

把这段放在：

```text
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

如果该文件已有其它条目，保留原有条目，只追加 `system-proxy` 这一段。

### 模式

| 模式 | 行为 |
| --- | --- |
| `auto` | 跟随 Windows 已启用的系统代理；默认值 |
| `manual` | 固定使用 `proxyUrl`，不依赖 Windows 开关 |
| `off` | 不使用插件代理，保留启动器原本的策略 |

### 手动代理

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
    useWindowsBypass: true
```

`proxyUrl` 支持 `http://` 和 `https://`。省略协议时会补成 `http://`。

### 认证代理

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://user:password@127.0.0.1:7897
```

日志中会隐藏认证信息。但代理 URL 会进入受管理子进程环境，因此只建议在本机可信环境中使用带凭据的代理。

### 环境变量优先级

显式环境变量高于 Windows 系统代理：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
```

优先级从高到低：

1. 当前进程里显式设置的 `HTTPS_PROXY`
2. 当前进程里显式设置的 `HTTP_PROXY`
3. Windows 系统代理
4. 启动器已有的其它代理配置 / `.env`

这意味着 CI 或调试终端里的临时代理设置不会被系统代理悄悄覆盖。

## 验证

### 1. 查看 Windows 状态

```powershell
$p = Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$p | Select-Object ProxyEnable, ProxyServer, ProxyOverride, AutoConfigURL
```

预期：

```text
ProxyEnable : 1
ProxyServer : 127.0.0.1:7897
```

### 2. 确认代理端口在监听

```powershell
Test-NetConnection 127.0.0.1 -Port 7897
```

### 3. 检查 DSH 进程是否连接代理

找到 `verge-mihomo` 或其它代理软件的 PID，以及 DSH host PID：

```powershell
$proxyPid = (Get-NetTCPConnection -LocalPort 7897 -State Listen).OwningProcess
$dshPid = (Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
  Where-Object { $_.CommandLine -match 'desktop-host' } |
  Select-Object -First 1 -ExpandProperty ProcessId)

Get-NetTCPConnection -OwningProcess $dshPid |
  Where-Object { $_.RemotePort -eq 7897 -and $_.RemoteAddress -eq '127.0.0.1' }
```

有 `Established` 就说明 DSH host 已经和本地代理建立连接。

### 4. 查看插件诊断

插件在 host 启动时会向 stderr 输出：

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

如果系统代理关闭：

```text
dsh-system-proxy: not active: no enabled Windows system proxy
```

## 故障排查

### DSH 仍然超时

按顺序检查：

1. 代理软件的系统代理开关是否打开；
2. `ProxyServer` 端口是否实际监听；
3. 代理软件是否监听 `127.0.0.1` 而不是只监听 IPv6；
4. DSH 是否完全重启，而不是刷新页面；
5. 当前 profile 是否是 `desktop`；
6. 是否被 `HTTP_PROXY` / `HTTPS_PROXY` 覆盖；
7. 是否存在 PAC URL 或 WPAD 自动检测。

### 设置了系统代理但插件没有启用

`dsh-system-proxy` 以 `ProxyEnable=1` 为准。只修改或遗留 `ProxyServer` 不够，必须真正打开 Windows 系统代理。

### 使用 PAC / WPAD

插件不会执行 PAC JavaScript，也不会自动发现 WPAD。请改用固定代理：

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

### 代理是 SOCKS5

请在代理软件中同时开启 HTTP 端口，然后使用 HTTP 端口。例如 Mihomo 的混合端口或 HTTP inbound。

### 卸载

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

然后完全重启 DSH。

## 兼容性

| 项目 | 范围 |
| --- | --- |
| 操作系统 | Windows 10/11 |
| DSH | `>=0.2.1-rc.2 <0.3.0` |
| Node | `>=22.19.0` |
| 代理协议 | HTTP / HTTPS |
| 系统代理来源 | 当前用户 WinINET |
| PAC / WPAD | 不支持 |
| SOCKS URL | 不直接支持 |
| Electron login/update | 不保证覆盖 |

如果上游 DSH 的 `dsh-http-proxy` API 或启动环境 API 发生 breaking change，插件会随 DSH 版本更新。

## 安全边界

- 插件不读取代理软件密码，只读取 Windows 注册表中的代理 URL 和绕过列表。
- `HTTP_PROXY` / `HTTPS_PROXY` 的凭据不会出现在插件日志里。
- `localhost` / `127.0.0.0/8` / `::1` 被强制直连，避免本地服务通过代理回环。
- 子进程继承代理变量是 DSH 官方行为；不要在不可信的本地环境里使用带凭据的代理 URL。
- 插件不会修改系统代理、WinHTTP 或机器级网络设置。

## 开发

### 环境

- Node.js `>=22.19.0`（由 DSH 当前 HTTP 代理依赖决定）
- pnpm

### 安装与测试

```powershell
pnpm install
pnpm test
```

### 项目结构

```text
.
├── lib/
│   ├── index.js           # Cordis 插件入口和 effect 生命周期
│   └── system-proxy.js    # Windows 代理读取、解析、绕过列表和配置
├── test/
│   ├── system-proxy.test.js
│   └── proxy-routing.test.js
├── cordis.patch.yml       # 默认 profile entry
├── package.json
└── README.md
```

### 发布

```powershell
pnpm test
pnpm pack --pack-destination .
```

GitHub Actions 会在 Windows 和 Ubuntu 上运行测试。Windows runner 覆盖真实 PowerShell/WinINET 解析，Ubuntu runner 验证跨平台的无依赖单元测试。

## License

MIT © [Bozheng-Li](https://github.com/Bozheng-Li)
