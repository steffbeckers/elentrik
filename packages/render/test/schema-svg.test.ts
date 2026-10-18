import { installatie, type BordBouwer } from "@elentrik/arei/testing";
import { opmaak, papierMaat, bruikbaar, STANDAARD_PAPIER_A4 } from "@elentrik/layout";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import { schemaPaginaSvg, schemaStripSvg } from "../src/index";
import { kloon, nummerNodeIds } from "./hulp";

const kringen = (n: number) =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) => {
        for (let i = 0; i < n; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(3));
      }),
    )
    .bouw().doc;

const aantal = (tekst: string, deel: string): number => tekst.split(deel).length - 1;

describe("schemaPaginaSvg", () => {
  test("snapshot voor een installatie met 2 kringen", () => {
    expect(nummerNodeIds(schemaPaginaSvg(opmaak(kringen(2)), 0))).toMatchSnapshot();
  });

  test("vervolgpijl: driehoek en tekst aan de binnenkant", () => {
    const o = opmaak(kringen(20));
    const links = (i: number) => schemaPaginaSvg(o, i);
    expect(links(0)).toMatch(/<g class="vervolg"><path d="M[\d. ]+ L[\d. -]+ L[\d. -]+ Z" fill="currentColor"\/><text class="tekst-vervolg"[^>]*text-anchor="end"[^>]*>p\. 2<\/text><\/g>/);
    expect(links(1)).toMatch(/<g class="vervolg">.*text-anchor="start"[^>]*>p\. 1<\/text><\/g>/);
  });

  test("root en groepen", () => {
    const svg = schemaPaginaSvg(opmaak(kringen(2)), 0);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" class="elentrik-schema" width="297mm" height="210mm" viewBox="0 0 297 210">')).toBe(true);
    expect(svg.startsWith("<?xml")).toBe(false);
    expect(svg).toContain('<clipPath id="schema-inhoud"><rect x="10" y="10" width="277" height="160"/></clipPath>');
    expect(svg).toMatch(/<g clip-path="url\(#schema-inhoud\)"><g transform="translate\(10 10\) scale\(1\) translate\(0 0\)">/);
  });

  test("A3 gebruikt de A3-maat", () => {
    const papier = { ...STANDAARD_PAPIER_A4, formaat: "A3" as const };
    const svg = schemaPaginaSvg(opmaak(kringen(2), papier), 0);
    expect(svg).toContain('width="420mm" height="297mm" viewBox="0 0 420 297"');
    expect(papierMaat("A3")).toEqual({ breedte: 420, hoogte: 297 });
    expect(bruikbaar(papier).hoogte).toBe(297 - 20 - 30);
  });

  test("goedgevormde XML voor elke pagina van 20 kringen", () => {
    const o = opmaak(kringen(20));
    expect(o.paginas.length).toBeGreaterThan(1);
    for (const pagina of o.paginas) {
      const svg = schemaPaginaSvg(o, pagina.index);
      expect(XMLValidator.validate(svg)).toBe(true);
    }
  });

  test("vervolgpijltjes verschijnen op meerdere pagina's", () => {
    const o = opmaak(kringen(20));
    const svg = schemaPaginaSvg(o, 0);
    expect(svg).toContain('<g class="vervolg">');
    expect(svg).toContain(">p. 2</text>");
  });

  test("het vervolglabel staat volledig boven de lijn, het pijltje op de lijn", () => {
    const o = opmaak(kringen(20));
    for (const pagina of o.paginas) {
      const svg = schemaPaginaSvg(o, pagina.index);
      const groepen = [...svg.matchAll(/<g class="vervolg"><path d="M[\d.-]+ ([\d.-]+) [^"]*"[^>]*\/><text[^>]* y="([\d.-]+)"/g)];
      expect(groepen.length).toBe(pagina.elementen.filter((e) => e.soort === "vervolg").length);
      for (const [, lijnY, tekstY] of groepen) {
        expect(Number(tekstY)).toBeLessThan(Number(lijnY) - 0.5);
      }
    }
    expect(schemaPaginaSvg(o, 0)).toContain('<g class="vervolg">');
  });

  test("een paginaIndex buiten het bereik gooit een RangeError", () => {
    const o = opmaak(kringen(2));
    expect(() => schemaPaginaSvg(o, -1)).toThrow(RangeError);
    expect(() => schemaPaginaSvg(o, o.paginas.length)).toThrow(RangeError);
    expect(() => schemaPaginaSvg(o, 0.5)).toThrow(RangeError);
    expect(() => schemaPaginaSvg(o, Number.NaN)).toThrow(RangeError);
  });
});

describe("schemaStripSvg", () => {
  test("aantal data-node-id is gelijk aan het aantal nodes", () => {
    const doc = kringen(5);
    const svg = schemaStripSvg(opmaak(doc));
    expect(aantal(svg, "data-node-id=")).toBe(Object.keys(doc.nodes).length);
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  test("viewBox is de strook op schaal 1, zonder clip", () => {
    const o = opmaak(kringen(3));
    const svg = schemaStripSvg(o);
    const { breedte, hoogte } = o.strook;
    expect(svg).toMatch(
      new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" class="elentrik-schema" width="[\\d.]+mm" height="[\\d.]+mm" viewBox="0 0 [\\d.]+ [\\d.]+">`),
    );
    expect(svg).toContain(`viewBox="0 0 ${Math.round(breedte * 100) / 100} ${Math.round(hoogte * 100) / 100}"`);
    expect(svg).not.toContain("clipPath");
    expect(svg).not.toContain("scale(");
  });

  test("elementen staan in opmaakvolgorde met rol-klassen", () => {
    const o = opmaak(kringen(2));
    const svg = schemaStripSvg(o);
    expect(svg).toContain('class="lijn-verbinding"');
    expect(svg).toContain('class="lijn-rail"');
    expect(svg).toContain('class="tekst-kring"');
    expect(svg.indexOf("data-node-id=")).toBeLessThan(svg.indexOf('class="lijn-verbinding"'));
  });
});

describe("schaal", () => {
  /** Kring met `diepte` geneste onderborden, zodat de strook hoger wordt dan het papier. */
  const diep = (diepte: number) => {
    const bouw = (b: BordBouwer, n: number): void => {
      b.kring((k) => {
        k.automaat(16).leiding(2.5);
        if (n > 0) k.onderbord((o) => bouw(o, n - 1), `bord ${n}`);
      });
    };
    return installatie()
      .verdeelbord((b) => bouw(b, diepte))
      .bouw().doc;
  };

  test("een afgeronde schaal overschrijdt de bruikbare hoogte nooit", () => {
    let getest = 0;
    for (let diepte = 1; diepte <= 12; diepte++) {
      const o = opmaak(diep(diepte));
      const pagina = o.paginas[0]!;
      const geheel = Math.abs(pagina.schaal * 100 - Math.round(pagina.schaal * 100)) < 1e-6;
      if (pagina.schaal >= 1 || pagina.schaal <= 0.5 || geheel) continue;
      const x = Number(/scale\(([\d.]+)\)/.exec(schemaPaginaSvg(o, 0))![1]);
      expect(x).toBeLessThanOrEqual(pagina.schaal);
      expect(o.strook.hoogte * x).toBeLessThanOrEqual(bruikbaar(o.papier).hoogte + 1e-9);
      getest++;
    }
    expect(getest).toBeGreaterThan(0);
  });
});

describe("structureel ongeldige documenten", () => {
  const basis = () =>
    installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .als("bord")
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(2).als("cd"))
            .kring((k) => k.automaat(16).als("k2").leiding(1.5).lichtpunten(1)),
        ),
      )
      .bouw();

  const cyclus = (): InstallatieDocument => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    fout.nodes[ids["cd"]!]!.kinderen.push(fout.rootId);
    return fout;
  };
  const dubbelKind = (): InstallatieDocument => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    fout.nodes[ids["bord"]!]!.kinderen.push(ids["k2"]!);
    return fout;
  };
  const protoId = (): InstallatieDocument => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    const cd = fout.nodes[ids["cd"]!]!;
    Object.defineProperty(fout.nodes, "__proto__", {
      value: { ...cd, id: "__proto__", parentId: cd.id, kinderen: [] },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    cd.kinderen.push("__proto__" as NodeId);
    return fout;
  };

  test.each([
    ["een cyclus", cyclus],
    ["een dubbel kind", dubbelKind],
    ["een node met id __proto__", protoId],
  ])("%s: goedgevormde SVG met elke data-node-id één keer", (_naam, bouw) => {
    const doc = bouw();
    const o = opmaak(doc);
    const strook = schemaStripSvg(o);
    expect(XMLValidator.validate(strook)).toBe(true);
    const ids = [...strook.matchAll(/data-node-id="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(Object.keys(doc.nodes).length);
    for (const pagina of o.paginas) {
      expect(XMLValidator.validate(schemaPaginaSvg(o, pagina.index))).toBe(true);
    }
  });
});

describe("escaping", () => {
  const naam = "<script>alert(1)</script>";
  const kabeltype = '"><img src=x onerror=alert(1)>';
  const doc = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(16)
            .leiding(2.5, { kabeltype })
            .onderbord((o) => o.kring((k2) => k2.automaat(10).leiding(1.5).lichtpunten(1)), naam),
        ),
      ),
    )
    .bouw().doc;

  test.each([
    ["strook", () => schemaStripSvg(opmaak(doc))],
    ["pagina", () => schemaPaginaSvg(opmaak(doc), 0)],
  ])("%s: documenttekst wordt geëscaped", (_naam, maak) => {
    const svg = maak();
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<img");
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });
});
