import { describe, expect, test } from "vitest";
import { NodeSchema } from "@elentrik/model";
import { tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd } from "./hulp";

describe("toestellen uit een overgenomen woningdossier", () => {
  test.each(["pvPaneel", "bel", "motor", "ventilator", "koelkast", "diepvriezer"])("%s blijft een eigen soort met een herkenbaar symbool", (soort) => {
    const opgeslagen = { id: "bron", parentId: "leiding", kinderen: [], type: "toestel", soort };
    const resultaat = NodeSchema.safeParse(JSON.parse(JSON.stringify(opgeslagen)));
    expect(resultaat.success).toBe(true);
    if (!resultaat.success) return;
    const symbool = tekenSymbool(resultaat.data);
    expect(isGoedgevormd(symbool)).toBe(true);
    expect(buitenVak(symbool)).toEqual([]);
    const algemeen = tekenSymbool(NodeSchema.parse({ ...opgeslagen, soort: "andere" }));
    expect(symbool.svg).not.toBe(algemeen.svg);
  });

  test("PV-paneel en omvormer hebben verschillende symbolen", () => {
    const toestel = (soort: string) => tekenSymbool(NodeSchema.parse({ id: "bron", parentId: "leiding", kinderen: [], type: "toestel", soort }));
    expect(toestel("pvPaneel").svg).not.toBe(toestel("omvormer").svg);
  });
});
