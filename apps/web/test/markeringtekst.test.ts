import type { Bevinding } from "@elentrik/arei";
import { describe, expect, test } from "vitest";
import { markeringRegels } from "../app/editor/markeringtekst";

const bevinding = (over: Partial<Bevinding> & Pick<Bevinding, "nodeIds">): Bevinding => ({
  regelId: "r",
  ernst: "fout",
  berichtSleutel: "s",
  parameters: {},
  afgeweken: false,
  ...over,
});
const tekst = (b: Bevinding): string => `${b.berichtSleutel}`;

describe("markeringRegels", () => {
  test("alleen de bevindingen waarin het onderdeel voorkomt, ook als het niet het onderwerp is", () => {
    const uitkomst = markeringRegels(
      [
        bevinding({ nodeIds: ["a"], berichtSleutel: "van a" }),
        bevinding({ nodeIds: ["b", "a"], berichtSleutel: "over b en a" }),
        bevinding({ nodeIds: ["c"], berichtSleutel: "van c" }),
      ],
      "a",
      tekst,
    );
    expect(uitkomst.regels.map((r) => r.tekst)).toEqual(["van a", "over b en a"]);
    expect(uitkomst.meer).toBe(0);
  });

  test("ergste eerst: fout, waarschuwing, info en dan wat gemotiveerd afgeweken is", () => {
    const uitkomst = markeringRegels(
      [
        bevinding({ nodeIds: ["a"], ernst: "info", berichtSleutel: "info" }),
        bevinding({ nodeIds: ["a"], ernst: "fout", afgeweken: true, berichtSleutel: "afgeweken" }),
        bevinding({ nodeIds: ["a"], ernst: "waarschuwing", berichtSleutel: "waarschuwing" }),
        bevinding({ nodeIds: ["a"], ernst: "fout", berichtSleutel: "fout" }),
      ],
      "a",
      tekst,
      10,
    );
    expect(uitkomst.regels).toEqual([
      { soort: "fout", tekst: "fout" },
      { soort: "waarschuwing", tekst: "waarschuwing" },
      { soort: "info", tekst: "info" },
      { soort: "afgeweken", tekst: "afgeweken" },
    ]);
  });

  test("dezelfde tekst met dezelfde ernst staat er één keer", () => {
    const uitkomst = markeringRegels(
      [bevinding({ nodeIds: ["a"], berichtSleutel: "zelfde" }), bevinding({ nodeIds: ["a", "b"], berichtSleutel: "zelfde" })],
      "a",
      tekst,
    );
    expect(uitkomst.regels).toHaveLength(1);
  });

  test("hoogstens drie regels; de rest wordt geteld", () => {
    const vijf = Array.from({ length: 5 }, (_, i) => bevinding({ nodeIds: ["a"], berichtSleutel: `nr ${i}` }));
    const uitkomst = markeringRegels(vijf, "a", tekst);
    expect(uitkomst.regels.map((r) => r.tekst)).toEqual(["nr 0", "nr 1", "nr 2"]);
    expect(uitkomst.meer).toBe(2);
  });

  test("een onderdeel zonder bevindingen heeft geen regels", () => {
    expect(markeringRegels([bevinding({ nodeIds: ["b"] })], "a", tekst)).toEqual({ regels: [], meer: 0 });
  });
});
