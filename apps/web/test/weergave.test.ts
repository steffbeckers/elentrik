import { describe, expect, test } from "vitest";
import {
  begrens,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  passendeWeergave,
  schermNaarInhoud,
  wielFactor,
  zoomRond,
  type Weergave,
} from "../app/editor/weergave";

const GRENZEN = { min: MIN_ZOOM, max: MAX_ZOOM };
const PLAN = { breedte: 8000, hoogte: 6000 };

describe("passendeWeergave", () => {
  test("toont een plan van 8000 x 6000 volledig en gecentreerd in 1000 x 500", () => {
    const w = passendeWeergave(PLAN, { breedte: 1000, hoogte: 500 }, 0);
    expect(w).not.toBeNull();
    // Schaal = min(1000/8000, 500/6000) = 1/12: de hoogte bepaalt, dus 12000 breed.
    expect(w!.h).toBeCloseTo(6000, 9);
    expect(w!.b).toBeCloseTo(12000, 9);
    expect(w!.x).toBeCloseTo(-2000, 9);
    expect(w!.y).toBeCloseTo(0, 9);
    expect(w!.x + w!.b / 2).toBeCloseTo(4000, 9);
    expect(w!.y + w!.h / 2).toBeCloseTo(3000, 9);
  });

  test("de marge komt aan elke kant bij de inhoud", () => {
    const w = passendeWeergave({ breedte: 100, hoogte: 50 }, { breedte: 210, hoogte: 110 }, 5)!;
    // Inhoud + marge = 110 x 60; schaal = min(210/110, 110/60) = 110/60.
    expect(w.h).toBeCloseTo(60, 9);
    expect(w.y).toBeCloseTo(-5, 9);
  });

  test("geeft null zolang het venster geen afmeting heeft", () => {
    expect(passendeWeergave(PLAN, { breedte: 0, hoogte: 500 }, 0)).toBeNull();
    expect(passendeWeergave(PLAN, { breedte: 1000, hoogte: 0 }, 0)).toBeNull();
  });
});

describe("begrens", () => {
  test("brengt een ver weggepande weergave terug met het midden op de rand", () => {
    const w: Weergave = { x: 50000, y: -40000, b: 1000, h: 500 };
    const b = begrens(w, PLAN);
    expect(b.x + b.b / 2).toBe(8000);
    expect(b.y + b.h / 2).toBe(0);
    expect(b.b).toBe(1000);
    expect(b.h).toBe(500);
  });

  test("laat een weergave met het midden binnen de inhoud ongemoeid", () => {
    const w: Weergave = { x: 100, y: 200, b: 1000, h: 500 };
    expect(begrens(w, PLAN)).toEqual(w);
  });
});

describe("zoomRond", () => {
  const venster = { breedte: 1000, hoogte: 500 };
  const passend = passendeWeergave(PLAN, venster, 0)!;

  test("houdt het ankerpunt op dezelfde plaats", () => {
    const anker = { fx: 0.25, fy: 0.75 };
    const voor = {
      x: passend.x + anker.fx * passend.b,
      y: passend.y + anker.fy * passend.h,
    };
    const w = zoomRond(passend, passend, anker, 2, venster, GRENZEN);
    expect(w.b).toBeCloseTo(passend.b / 2, 9);
    expect(w.x + anker.fx * w.b).toBeCloseTo(voor.x, 9);
    expect(w.y + anker.fy * w.h).toBeCloseTo(voor.y, 9);
  });

  test("de hoogte volgt de beeldverhouding van het venster", () => {
    const w = zoomRond(passend, passend, { fx: 0.5, fy: 0.5 }, 3, venster, GRENZEN);
    expect(w.h / w.b).toBeCloseTo(venster.hoogte / venster.breedte, 9);
  });

  test("begrenst de zoom tot het maximum", () => {
    const w = zoomRond(passend, passend, { fx: 0.5, fy: 0.5 }, 1000, venster, GRENZEN);
    expect(passend.b / w.b).toBeCloseTo(MAX_ZOOM, 9);
  });

  test("begrenst de zoom tot het minimum", () => {
    const w = zoomRond(passend, passend, { fx: 0.5, fy: 0.5 }, 0.0001, venster, GRENZEN);
    expect(passend.b / w.b).toBeCloseTo(MIN_ZOOM, 9);
  });

  test("zoom is relatief aan de passende weergave, niet aan de huidige", () => {
    const eerst = zoomRond(passend, passend, { fx: 0.5, fy: 0.5 }, 2, venster, GRENZEN);
    const dan = zoomRond(eerst, passend, { fx: 0.5, fy: 0.5 }, 2, venster, GRENZEN);
    expect(passend.b / dan.b).toBeCloseTo(4, 9);
  });
});

describe("pan", () => {
  const venster = { breedte: 1000, hoogte: 500 };

  test("een sleep naar rechts verschuift de weergave naar links in de inhoud", () => {
    const begin: Weergave = { x: 100, y: 200, b: 2000, h: 1000 };
    const w = pan(begin, 100, 50, venster);
    expect(w.x).toBeCloseTo(100 - 200, 9);
    expect(w.y).toBeCloseTo(200 - 100, 9);
    expect(w.b).toBe(2000);
    expect(w.h).toBe(1000);
  });

  test("zonder beweging blijft de weergave gelijk", () => {
    const begin: Weergave = { x: 1, y: 2, b: 3, h: 4 };
    expect(pan(begin, 0, 0, venster)).toEqual(begin);
  });
});

describe("wielFactor", () => {
  test("wiel omhoog (negatief) zoomt in, omlaag uit", () => {
    expect(wielFactor(-100, 0, 800)).toBeCloseTo(Math.exp(0.15), 12);
    expect(wielFactor(100, 0, 800)).toBeCloseTo(Math.exp(-0.15), 12);
    expect(wielFactor(0, 0, 800)).toBe(1);
  });

  test("deltaMode 1 (regels) telt 16 maal, deltaMode 2 (pagina) de schermhoogte", () => {
    expect(wielFactor(-3, 1, 800)).toBeCloseTo(Math.exp(3 * 16 * 0.0015), 12);
    expect(wielFactor(-1, 2, 800)).toBeCloseTo(Math.exp(800 * 0.0015), 12);
  });
});

describe("schermNaarInhoud", () => {
  const rect = { left: 20, top: 10, width: 1000, height: 500 };
  const w: Weergave = { x: -2000, y: 0, b: 12000, h: 6000 };

  test("is de inverse van de projectie", () => {
    const klik = { x: 1500, y: 3200 };
    // Projectie van inhoud naar scherm.
    const clientX = rect.left + ((klik.x - w.x) / w.b) * rect.width;
    const clientY = rect.top + ((klik.y - w.y) / w.h) * rect.height;
    const terug = schermNaarInhoud(clientX, clientY, rect, w);
    expect(terug.x).toBeCloseTo(klik.x, 9);
    expect(terug.y).toBeCloseTo(klik.y, 9);
  });

  test("de linkerbovenhoek van het venster is de oorsprong van de weergave", () => {
    expect(schermNaarInhoud(20, 10, rect, w)).toEqual({ x: -2000, y: 0 });
  });
});
