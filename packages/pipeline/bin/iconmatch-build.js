#!/usr/bin/env -S node --conditions=source
// Runs the TypeScript CLI (and a TypeScript iconmatch.config.ts) via tsx.
import process from "node:process";
import { register } from "tsx/esm/api";

register();
const { main } = await import("../src/cli.ts");
process.exitCode = await main(process.argv.slice(2));
