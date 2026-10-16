# A plugin installs from its page card only; settings pages save options

- **Date:** 2026-10-15
- **Type:** feature
- **Scope:** `web`, `server`, `plugins`

[中文版](2026-10-15-plugins-ux-unify-with-skills.zh.md)

A Skill installs from the page that lists it, and a plugin now does too: the settings page no longer installs anything. A switch there saves like any other option — it no longer opens an installer, and turning it on is not answered by installing what the switch needs. The Sandbox card's notice, which already points to the Plugins page when the deployment has no usable backend, keeps that job alone.

## Changes

- The platform-level install prompt that the Sandbox card raised when its backend was missing is gone: the dialog, its per-machine "do not ask again" bookkeeping, its ordered installer, and the "the switch is already on" callback it fired after installing. A backend package is installed and removed on the Plugins page, from the library plugin's install dialog or a module card, the way a Skill installs from its own listing.
- The server no longer reports backend status to the settings card: the plugin-config response loses its `backend` member and its `PluginConfigBackend` type, and the settings-status group loses the backend member and the default-package table that served only the removed prompt.
- The settings feature no longer contains any install call, and a test guards it: a scan asserts the settings sources install no plugins, with the Plugins page as the control that must keep its own calls.
