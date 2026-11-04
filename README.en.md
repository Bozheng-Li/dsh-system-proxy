# dsh-system-proxy

Use the Windows system proxy in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). No TUN required.

Supports Windows 10/11 and DSH `0.2.1-rc.2` through pre-`0.3.0`.

## Install

In DSH, open **Plugins → Add plugin** and enter:

```text
dsh-system-proxy@0.1.1
```

Fully quit and reopen DSH after installation.

Or install from the CLI:

```powershell
dsh plugin --profile desktop add dsh-system-proxy
```

## Usage

Turn on **System Proxy** in the proxy client and keep TUN mode off. The plugin reads the current user's Windows HTTP proxy settings automatically.

It covers model requests, Web Search, HTTP MCP, and DSH child processes such as pnpm and git. Electron login and update traffic is not guaranteed to be covered.

## Configuration

The default `auto` mode follows the Windows system proxy. To pin a proxy, edit `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`:

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

| mode | Behavior |
| --- | --- |
| `auto` | Follow the Windows system proxy; default |
| `manual` | Always use `proxyUrl` |
| `off` | Disable the proxy |

Explicit `HTTP_PROXY` / `HTTPS_PROXY` values take precedence. PAC/WPAD is not supported; for SOCKS, use the proxy client's HTTP or mixed port.

## Troubleshooting

A successful mount logs:

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

If it does not work, check:

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

Confirm the system proxy is enabled, the port is listening, DSH was fully restarted, and the active profile is `desktop`.

## Uninstall

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

Restart DSH afterwards.

MIT License · [Chinese](README.md)
