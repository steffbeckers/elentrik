import { PAKKET as layout } from "@elentrik/layout";
import { PAKKET as render } from "@elentrik/render";
import { PAKKET as symbols } from "@elentrik/symbols";
import { expect, test } from "vitest";

test("de drie nieuwe pakketten zijn bereikbaar via de workspace", () => {
  expect([symbols, layout, render]).toEqual([
    "@elentrik/symbols",
    "@elentrik/layout",
    "@elentrik/render",
  ]);
});
