#!/usr/bin/env node
// Runs the TypeScript eval CLI via tsx.
import process from "node:process";
import { register } from "tsx/esm/api";

register();
const { main } = await import("../src/cli.ts");
process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (m) => process.stdout.write(`${m}\n`),
  error: (m) => process.stderr.write(`${m}\n`),
});
