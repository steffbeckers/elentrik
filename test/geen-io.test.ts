import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { VERBODEN } from "./io-regels";

const pakkettenMap = join(import.meta.dirname, "..", "packages");
const extensies = [".ts", ".tsx", ".mts", ".vue"];

function bronbestanden(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((item) => {
    const pad = join(map, item.name);
    if (item.isDirectory()) return bronbestanden(pad);
    return extensies.some((extensie) => pad.endsWith(extensie)) ? [pad] : [];
  });
}

describe("VERBODEN", () => {
  test.each([
    'import "node:fs"',
    'import x from "node:path"',
    'await import("node:path")',
    'import("node:fs/promises")',
    'import { readFile } from "fs"',
    'from "fs"',
    'from "fs/promises"',
    'const fs = require("fs")',
    "await fetch(url)",
    'from "vue"',
    "from 'vue'",
    'from "nuxt"',
    'from "nuxt/app"',
  ])("matcht %s", (tekst) => {
    expect(VERBODEN.test(tekst)).toBe(true);
  });

  test.each([
    'from "./fs-hulp"',
    'from "@elentrik/model"',
    'import "./vuejs-hulp"',
    "const fetcher = 1",
    "const required = 1",
    'import { x } from "./node-hulp"',
  ])("matcht niet %s", (tekst) => {
    expect(VERBODEN.test(tekst)).toBe(false);
  });
});

test("geen I/O, Vue of Nuxt in pakketbronnen", () => {
  const bronmappen = readdirSync(pakkettenMap, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => join(pakkettenMap, item.name, "src"))
    .filter((map) => existsSync(map));

  const overtreders = bronmappen
    .flatMap((map) => bronbestanden(map))
    .filter((bestand) => VERBODEN.test(readFileSync(bestand, "utf8")))
    .map((bestand) => relative(pakkettenMap, bestand));

  expect(overtreders).toEqual([]);
});
