# dsh-system-proxy

Use the Windows system proxy in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Enable the proxy client's system proxy and HTTP port; no TUN mode is needed for DSH.

Windows 10/11 and DSH `0.2.1-rc.2` through pre-`0.3.0` are supported.

## Install

The package is not published to npm yet. Install from GitHub:

```powershell
# dsh on PATH
dsh plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"

# CLI bundled with the desktop app
& "D:\deepseek-harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "github:Bozheng-Li/dsh-system-proxy"
```

Fully quit and restart DSH. Then enable the proxy client's system proxy, for example `127.0.0.1:7897`, and keep TUN off.

The plugin installs a process-wide undici dispatcher for DSH requests that use Node `fetch()`, including model requests, Web Search and HTTP MCP. Electron login/update traffic is not guaranteed to be covered.

### Install from Discover

DSH currently has no official marketplace. Enable **More > Custom plugin markets**, then add this source under **Discover**:

```text
https://raw.githubusercontent.com/Bozheng-Li/dsh-system-proxy/main/market/index.json
```

Search for `dsh-system-proxy` or `Windows proxy`. The index pins a Git commit and does not require an npm release.

## Configuration

The default follows the Windows system proxy. To pin a proxy, edit:

`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`

```yaml
- id: system-proxy
  config:
    mode: manual
    proxyUrl: http://127.0.0.1:7897
```

Modes: `auto` follows Windows, `manual` pins `proxyUrl`, and `off` disables the plugin. Explicit `HTTP_PROXY` / `HTTPS_PROXY` wins. PAC/WPAD and SOCKS URLs are not supported directly; use the proxy client's HTTP or mixed port.

## Verify

```powershell
Get-ItemProperty `
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer

Test-NetConnection 127.0.0.1 -Port 7897
```

A successful mount logs:

```text
dsh-system-proxy: using http://127.0.0.1:7897 from Windows system proxy
```

If it does not work, check the system proxy toggle, listening port, a full DSH restart, the `desktop` profile, and any overriding proxy environment variables.

## Uninstall

```powershell
dsh plugin --profile desktop remove dsh-system-proxy
```

Restart DSH afterwards.

## Development

```powershell
pnpm install
pnpm market:generate  # Repoint the index after a release
pnpm test
pnpm pack --pack-destination .
```

The index lives at [market/index.json](market/index.json). Commit the package code first, then generate and commit the index.

MIT License · [中文](README.md)
