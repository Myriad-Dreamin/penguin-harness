# macOS 的 CI job 重新能构建 server

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `ci`

[English](2026-09-29-ci-macos-build-heap.md)

各 CI job 共用的构建步骤现在以 4 GB 堆运行 Node。7 GB 的 `macos-latest` runner 上默认堆约 2 GB，而 server
的类型声明构建需要的比这更多，于是 `test-macos (server)`、`test-macos (rest)` 与
`runtime (macos-latest, --mac)` 都在任何测试开跑之前以 `ERR_WORKER_OUT_OF_MEMORY` 失败。ubuntu 与 windows
runner 的默认堆本就是 4 GB，它们的构建所见上限与此前相同。

## 细节

- 构建步骤在构建前打印 runner 的内存，以及默认与实际生效的两个堆上限。
- 只有构建步骤带这一设置；测试步骤仍用 runner 的默认值。
