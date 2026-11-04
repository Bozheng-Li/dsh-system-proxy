# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-04

### Fixed

- Publish proxy environment variables to DSH-managed child processes, including pnpm and git.
- Normalize Windows semicolon bypass lists and wildcard IPv4 ranges for `NO_PROXY`.
- Publish the package to npm and use npm as the primary installation source.

## [0.1.0] - 2026-11-04

### Added

- Windows per-user system proxy detection through WinINET.
- Automatic `auto`, fixed `manual`, and opt-out `off` modes.
- Reuse of DSH's official `@deepseek-ai/dsh-http-proxy` global dispatcher.
- HTTP/HTTPS proxy URL normalization and Windows bypass-list translation.
- Loopback bypasses for local DSH and development traffic.
- Explicit environment-variable precedence over Windows settings.
- PAC/WPAD detection with a safe direct-route fallback.
- Cordis effect cleanup that restores the previous dispatcher.
- Unit and real local HTTP proxy routing tests.
- Chinese and English documentation.

[Unreleased]: https://github.com/Bozheng-Li/dsh-system-proxy/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Bozheng-Li/dsh-system-proxy/releases/tag/v0.1.1
[0.1.0]: https://github.com/Bozheng-Li/dsh-system-proxy/releases/tag/v0.1.0
