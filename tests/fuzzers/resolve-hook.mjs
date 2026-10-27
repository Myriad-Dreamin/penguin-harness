/**
 * `--import` entry for every process that loads the fuzz build (see run.mjs).
 *
 * `registerHooks` (Node 22.15+) runs in-process and synchronously, so the mapping is in
 * place before the first import and needs no make-up thread.
 */
import { registerHooks } from "node:module";
import { resolveWorkspaceSpecifiers } from "./resolve-hooks.mjs";

registerHooks({ resolve: resolveWorkspaceSpecifiers });
