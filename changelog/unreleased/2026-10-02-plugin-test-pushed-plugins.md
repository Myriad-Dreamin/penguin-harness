# The plugin test harness brings a plugin directory as a hot push would

- **Date:** 2026-10-02
- **Type:** feature
- **Scope:** `plugin-test`

[中文版](2026-10-02-plugin-test-pushed-plugins.zh.md)

`startHarness` no longer lists a plugin directory by its entry file's absolute path, which the server no longer loads. It packs the directory, has npm install the tarball into the scratch root's push assets (`hmr/plugin-test-assets/plugins`, named by `hmr/harness.json`), and indexes it with the tarball's npm integrity; the Project lists the plugin by its package name, and the server stores and activates it like any plugin a push carries. `stagePushedPlugins` is exported for a test that stages plugins itself.
