import { installatie } from "@elentrik/arei/testing";
import { opmaak, papierMaat, bruikbaar, STANDAARD_PAPIER_A4 } from "@elentrik/layout";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import { schemaPaginaSvg, schemaStripSvg } from "../src/index";

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
    // Node-id's zijn willekeurig; vervang ze door een volgnummer zodat de snapshot stabiel is.
    const nummers = new Map<string, number>();
    const svg = schemaPaginaSvg(opmaak(kringen(2)), 0).replace(/data-node-id="([^"]*)"/g, (_m, id: string) => {
      if (!nummers.has(id)) nummers.set(id, nummers.size + 1);
      return `data-node-id="n${nummers.get(id)}"`;
    });
    expect(svg).toMatchSnapshot();
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
