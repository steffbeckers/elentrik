import { installatie } from "@elentrik/arei/testing";
import { tekenSymbool } from "@elentrik/symbols";
import { expect, test } from "vitest";
import { situatieLaagSvg, type SituatieItem } from "../src/index";

// `performance` zit niet in lib ES2023 (geen DOM- of Node-types); Node en Vitest leveren het wel.
declare const performance: { now(): number };

const AANTAL = 300;

function mediaan(waarden: readonly number[]): number {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 1
    ? (gesorteerd[midden] ?? Infinity)
    : ((gesorteerd[midden - 1] ?? Infinity) + (gesorteerd[midden] ?? Infinity)) / 2;
}

test("situatieLaagSvg met 300 items: mediaan van 20 runs onder 16 ms", { timeout: 60_000 }, () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
    .bouw();
  const nodeId = ids["cd"]!;
  const symbool = tekenSymbool(doc.nodes[nodeId]!);
  const items: SituatieItem[] = Array.from({ length: AANTAL }, (_, i) => ({
    nodeId,
    symbool,
    x: (i % 20) * 100 + 0.5,
    y: Math.floor(i / 20) * 100 + 0.25,
    rotatie: (i % 24) * 15,
    label: `A${i + 1}`,
  }));

  for (let i = 0; i < 5; i++) situatieLaagSvg(items, 60);
  const tijden: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    situatieLaagSvg(items, 60);
    tijden.push(performance.now() - start);
  }
  expect(mediaan(tijden)).toBeLessThan(16);
});
