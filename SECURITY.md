# Security Policy

## Reporting

Please report security issues privately through GitHub's **Report a vulnerability**
feature rather than a public issue.

## Scope

The plugin reads the current user's Windows WinINET proxy settings and installs
DSH's process-wide outbound proxy policy. It does not modify system networking,
read proxy-client credentials, or open a listening port.

Proxy URLs containing usernames or passwords are supported for authenticated
proxies. They are redacted from plugin diagnostics, but they are propagated to
DSH-managed subprocesses by the host's documented proxy environment behavior.
Do not use this feature in an untrusted local environment.
