<div align="center">

# DSH System Proxy

**Use the Windows system proxy directly in DeepSeek Harness.**

Keep the system proxy on. Keep TUN off. Model requests, plugin installs, and developer tools share one network path.

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

| No proxy address setup | No network takeover | Installs use the same route |
| :--- | :--- | :--- |
| Reads the current user's Windows HTTP proxy | No routes, virtual adapters, or listening ports | Model requests, Web Search, HTTP MCP, pnpm, and git |

## Install

DSH **0.2.1-rc.2** through pre-**0.3.0**, Windows 10/11.

Open **Plugins → Add plugin** and enter:

```text
dsh-system-proxy@0.1.1
```

**Fully quit and reopen DSH** after installation.

<details>
<summary><b>Install from the CLI</b></summary>

```powershell
# dsh on PATH
dsh plugin --profile desktop add dsh-system-proxy

# CLI bundled with the desktop app
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add dsh-system-proxy
```

Install directly from GitHub:

```powershell
dsh plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"
```

</details>

## Enable

1. Turn on **System Proxy** in the proxy client
2. Keep **TUN off**
3. Restart DSH

The plugin reads the current user's WinINET settings at startup. No IP or port is normally needed.

> DSH runs inside Electron. The plugin covers Node.js/undici requests and DSH child processes; Electron-managed login and update traffic is not guaranteed to be covered.

## Configuration

The defaults cover most setups:

```yaml
mode: auto
useWindowsBypass: true
```

To pin a proxy, add this to `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`:

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

<details>
<summary><b>Options and precedence</b></summary>

| Option | Description |
| :--- | :--- |
| `mode: auto` | Follow the Windows system proxy; default |
| `mode: manual` | Always use `proxyUrl` |
| `mode: off` | Do not apply the plugin proxy |
| `useWindowsBypass` | Merge the Windows bypass list; default `true` |

Precedence: explicit `HTTP_PROXY` / `HTTPS_PROXY` → plugin config → Windows system proxy.

PAC/WPAD is not supported. For SOCKS, use the proxy client's HTTP or mixed port.

</details>

## Verify

A successful mount logs:

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

Inspect the Windows setting and proxy port:

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

If it does not work, confirm that the system proxy is on, the port is listening, DSH was fully restarted, the active profile is `desktop`, and no explicit proxy environment variable overrides it.

## Uninstall

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

Restart DSH.

---

<div align="center">

[中文](README.md) · [Issues](https://github.com/Bozheng-Li/dsh-system-proxy/issues) · [Releases](https://github.com/Bozheng-Li/dsh-system-proxy/releases)

MIT License

</div>
