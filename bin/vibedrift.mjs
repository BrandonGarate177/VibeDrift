#!/usr/bin/env node
/* global process */
// We used to pass `--no-warnings` in the shebang, but `env` on Linux does not
// split multi-argument shebangs, which broke the globally-installed binary.
// Suppress the cosmetic experimental-module warnings in-process instead, then
// load the CLI (dynamic import so this runs before the CLI module evaluates).
const _emit = process.emit;
process.emit = function (event, data, ...rest) {
  if (event === "warning" && data && /ExperimentalWarning/.test(String(data.name))) {
    return false;
  }
  return _emit.call(this, event, data, ...rest);
};
await import("../dist/cli/index.js");
