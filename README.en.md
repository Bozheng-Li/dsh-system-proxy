<div align="center">

# dsh-system-proxy

**Let DeepSeek Harness reuse the Windows system proxy, without keeping TUN mode on just for model traffic.**

[![CI](https://github.com/Bozheng-Li/dsh-system-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/Bozheng-Li/dsh-system-proxy/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-system-proxy?logo=npm)](https://www.npmjs.com/package/dsh-system-proxy)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4f46e5)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f766e.svg)](LICENSE)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting) · [中文](README.md)

</div>

> [!IMPORTANT]
> This is a Windows-only host plugin for DSH. It reads the current user's **WinINET fixed system proxy** and installs a process-wide outbound policy through DSH's official `@deepseek-ai/dsh-http-proxy`. It is not a system VPN or a TUN replacement.

## Why this exists

Tools such as Clash Verge, Mihomo and v2rayN can turn on a system proxy, and browsers pick it up automatically. Node.js `fetch()` does not read the Windows system proxy by default. DSH's model, search and MCP requests mostly use the Node stack, which leads to a familiar failure mode:

- a browser can reach the internet, while DSH requests time out;
- model calls only work when TUN mode is enabled;
- proxy environment variables have to be configured again for every terminal and every start.

`dsh-system-proxy` connects the Windows proxy toggle to DSH's official outbound proxy policy. Turn on the system proxy, restart DSH, and model traffic can use the same HTTP(S) proxy as the browser.

## Features

- **Follows the system toggle**: `ProxyEnable` is authoritative. A stale `ProxyServer` value does not enable a proxy while the system proxy is off.
- **Reuses DSH's official transport**: calls the same undici dispatcher installer shipped by DSH.
- **Covers common requests**: model SDKs using global `fetch()`, Web Search and HTTP MCP share the process-wide policy.
- **Child-process propagation**: DSH-managed child processes receive the same proxy through the official subprocess environment.
- **Safe bypasses**: `localhost`, `127.0.0.0/8` and `::1` stay direct, preventing local Web UI and development servers from looping through the proxy.
- **Explicit precedence**: explicit `HTTP_PROXY` / `HTTPS_PROXY` wins; manual mode can pin an address.
- **Diagnostics**: PAC/WPAD, invalid values, permission errors and unreachable proxy ports produce explicit results instead of silent failures.
- **Lifecycle-safe**: the plugin restores the previous dispatcher when its Cordis effect is disposed.
- **Testable**: unit tests plus a real local HTTP proxy routing test, with no external network required.

## Quick start

### Prerequisites

- Windows 10/11
- DeepSeek Harness `>= 0.2.1-rc.2 < 0.3.0`
- Node.js `>=22.19.0` for source development (required by DSH's HTTP proxy dependency)
- An HTTP or HTTPS proxy endpoint, for example `127.0.0.1:7897` from Clash/Mihomo

> Most proxy clients expose both SOCKS and HTTP ports. DSH's official policy accepts HTTP(S) proxy URLs; a SOCKS URL is not directly supported.

### Install

```powershell
# Published package
dsh plugin --profile desktop add dsh-system-proxy

# Or a source checkout
dsh plugin --profile desktop add "E:\path\to\dsh-system-proxy"

# Or the tarball
dsh plugin --profile desktop add "E:\path\to\dsh-system-proxy-0.1.0.tgz"
```

If `dsh` is not on PATH, use the CLI bundled with the desktop app:

```powershell
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add dsh-system-proxy
```

Fully quit DSH and start it again. Reloading the Web UI does not reload host plugins.

### Turn on the system proxy

1. Enable **System Proxy** in your proxy client.
2. Confirm its HTTP port, for example `127.0.0.1:7897`.
3. Keep TUN mode off.
4. Restart DSH.

## How it works

DSH's launcher already installs a proxy policy from its launch environment. This plugin reads the current user's WinINET settings, builds a launch environment overlaid with the system proxy, and calls the same official installer.

This means:

1. no changes to `app.asar`;
2. no extra local forwarding daemon;
3. no hard dependency on a particular SDK transport;
4. the previous dispatcher is restored when the plugin unloads;
5. a disabled system proxy does not accidentally use a stale proxy server value.

### Coverage

| Request type | Covered | Notes |
| --- | --- | --- |
| Model API (Node `fetch` / SDK) | Yes | Through DSH's global undici dispatcher |
| Web Search | Yes | Through the DSH host |
| HTTP MCP | Yes | Through the global outbound policy |
| DSH-managed shell/subprocesses | Yes | DSH propagates proxy environment to child processes |
| Electron login/auto-update | Not guaranteed | Chromium network stack, separate from DSH Node requests |
| Arbitrary system apps | No | This plugin does not alter system-wide networking |

## Configuration

Default entry:

```yaml
- id: system-proxy
  config:
    mode: auto
    proxyUrl: ""
    useWindowsBypass: true
```

Place it in:

```text
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

If the file already contains other entries, keep them and append the `system-proxy` entry.

### Modes

| Mode | Behavior |
| --- | --- |
| `auto` | Follow the enabled Windows system proxy; default |
| `manual` | Pin `proxyUrl`, independent of the Windows toggle |
| `off` | Keep DSH's original launcher policy |

### Manual proxy

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
    useWindowsBypass: true
```

`http://` and `https://` URLs are accepted. A bare `host:port` value is normalized to `http://host:port`.

### Authenticated proxy

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://user:password@127.0.0.1:7897
```

Credentials are redacted from plugin logs. The URL is propagated to managed child processes, so use a credential-bearing URL only in a trusted local environment.

### Environment-variable precedence

An explicitly exported proxy wins over the Windows setting:

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
```

Order:

1. explicit `HTTPS_PROXY` in the current process
2. explicit `HTTP_PROXY` in the current process
3. Windows system proxy
4. other launcher / `.env` proxy configuration

## Verification

```powershell
$p = Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$p | Select-Object ProxyEnable, ProxyServer, ProxyOverride, AutoConfigURL

Test-NetConnection 127.0.0.1 -Port 7897
```

Then check that the DSH host has a connection to the proxy port:

```powershell
$dshPid = (Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
  Where-Object { $_.CommandLine -match 'desktop-host' } |
  Select-Object -First 1 -ExpandProperty ProcessId)

Get-NetTCPConnection -OwningProcess $dshPid |
  Where-Object { $_.RemotePort -eq 7897 -and $_.RemoteAddress -eq '127.0.0.1' }
```

An `Established` connection means DSH's host is using the local proxy.

The plugin also writes a diagnostic when it mounts:

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

## Troubleshooting

### DSH still times out

1. Check the proxy client's system-proxy toggle.
2. Check that `ProxyServer` is listening.
3. Check that the proxy binds to `127.0.0.1`, not only IPv6.
4. Fully restart DSH, not just the page.
5. Confirm the active profile is `desktop`.
6. Check for an overriding `HTTP_PROXY` / `HTTPS_PROXY`.
7. Check for PAC or WPAD.

### System proxy is configured but the plugin is inactive

`dsh-system-proxy` follows `ProxyEnable`. A stale `ProxyServer` value alone is not enough; Windows system proxy must actually be enabled.

### PAC / WPAD

The plugin does not execute PAC JavaScript or perform WPAD discovery. Use a fixed proxy:

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

### The client only exposes SOCKS5

Enable an HTTP or mixed port in the proxy client and use that port. A SOCKS URL is not directly supported by DSH's HTTP proxy policy.

### Uninstall

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

Fully restart DSH afterwards.

## Compatibility

| Item | Range |
| --- | --- |
| OS | Windows 10/11 |
| DSH | `>=0.2.1-rc.2 <0.3.0` |
| Node | `>=22.19.0` |
| Proxy protocol | HTTP / HTTPS |
| System proxy source | Per-user WinINET |
| PAC / WPAD | Not supported |
| SOCKS URL | Not supported directly |
| Electron login/update | Not guaranteed |

## Security boundaries

- The plugin does not read proxy-client passwords; it only reads the registry proxy URL and bypass list.
- Credentials in proxy URLs are redacted from plugin logs.
- Loopback traffic is always direct.
- Managed child processes inherit proxy variables by DSH's official design; do not use credential-bearing proxy URLs in untrusted local environments.
- The plugin does not modify the system proxy, WinHTTP, or machine-wide network settings.

## Development

```powershell
pnpm install
pnpm test
pnpm pack --pack-destination .
```

```text
.
├── lib/
│   ├── index.js           # Cordis entry point and effect lifecycle
│   └── system-proxy.js    # Windows detection, parsing and bypass policy
├── test/
│   ├── system-proxy.test.js
│   └── proxy-routing.test.js
├── cordis.patch.yml
├── package.json
└── README.md
```

GitHub Actions runs the suite on Windows and Ubuntu. The Windows runner covers PowerShell/WinINET behavior; Ubuntu covers the platform-independent parser and lifecycle tests.

## License

MIT © [Bozheng-Li](https://github.com/Bozheng-Li)
