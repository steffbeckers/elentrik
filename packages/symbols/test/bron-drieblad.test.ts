import { expect, test } from "vitest";
import { NodeSchema, type Node } from "@elentrik/model";
import { tekenSymbool } from "../src/index";
import { isGoedgevormd, buitenVak } from "./hulp";

test("het onbekende driebladen-bronsymbool blijft een expliciete onbekende toestelsoort", () => {
  const node = { id: "h3", parentId: "s", kinderen: [], type: "toestel", soort: "onbekendDrieblad" };
  expect(NodeSchema.safeParse(node).success).toBe(true);
  const symbool = tekenSymbool(node as Node);
  expect(symbool.svg).toContain('data-rol="bron-drieblad"');
  expect(symbool.svg).not.toContain("M</text>");
  expect(isGoedgevormd(symbool)).toBe(true);
  expect(buitenVak(symbool)).toEqual([]);
});
