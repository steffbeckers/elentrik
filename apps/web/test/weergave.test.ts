import { describe, expect, test } from "vitest";
import {
  begrens,
  inhoudNaarScherm,
  MAX_ZOOM,
  maxPlanZoom,
  MIN_ZOOM,
  pan,
  passendeWeergave,
  pinch,
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

describe("inhoudNaarScherm", () => {
  const rect = { left: 20, top: 10, width: 1000, height: 500 };
  const w: Weergave = { x: -2000, y: 0, b: 12000, h: 6000 };

  test("de oorsprong van de weergave is de linkerbovenhoek van het venster", () => {
    expect(inhoudNaarScherm(-2000, 0, rect, w)).toEqual({ x: 20, y: 10 });
  });

  test("heen en terug met schermNaarInhoud geeft hetzelfde punt", () => {
    for (const punt of [{ x: 1500, y: 3200 }, { x: 8000, y: 6000 }, { x: -2000, y: 0 }]) {
      const scherm = inhoudNaarScherm(punt.x, punt.y, rect, w);
      const terug = schermNaarInhoud(scherm.x, scherm.y, rect, w);
      expect(terug.x).toBeCloseTo(punt.x, 9);
      expect(terug.y).toBeCloseTo(punt.y, 9);
    }
    const inhoud = schermNaarInhoud(700, 333, rect, w);
    const scherm = inhoudNaarScherm(inhoud.x, inhoud.y, rect, w);
    expect(scherm.x).toBeCloseTo(700, 9);
    expect(scherm.y).toBeCloseTo(333, 9);
  });
});

describe("maxPlanZoom", () => {
  test("een raster van 8000 x 6000 in 1000 x 500 zoomt tot 1 rasterpixel = 2 schermpixels", () => {
    const venster = { breedte: 1000, hoogte: 500 };
    const passend = passendeWeergave(PLAN, venster, 0)!;
    const max = maxPlanZoom(passend, venster);
    // Passend: 12000 rasterpixels over 1000 schermpixels; 2 schermpixels per rasterpixel is zoom 24.
    expect(max).toBeCloseTo(24, 9);
    expect(venster.breedte / (passend.b / max)).toBeCloseTo(2, 9);
  });

  test("hangt af van het venster: een breder venster heeft minder zoom nodig", () => {
    const smal = { breedte: 1000, hoogte: 750 };
    const breed = { breedte: 2000, hoogte: 1500 };
    expect(maxPlanZoom(passendeWeergave(PLAN, smal, 0)!, smal)).toBeCloseTo(16, 9);
    expect(maxPlanZoom(passendeWeergave(PLAN, breed, 0)!, breed)).toBeCloseTo(8, 9);
  });

  test("is minstens MAX_ZOOM voor een klein raster", () => {
    const venster = { breedte: 1000, hoogte: 500 };
    const passend = passendeWeergave({ breedte: 400, hoogte: 300 }, venster, 0)!;
    expect(maxPlanZoom(passend, venster)).toBe(MAX_ZOOM);
  });

  test("zoomRond met deze grens komt tot 2 schermpixels per rasterpixel en niet verder", () => {
    const venster = { breedte: 1000, hoogte: 500 };
    const passend = passendeWeergave(PLAN, venster, 0)!;
    const grenzen = { min: MIN_ZOOM, max: maxPlanZoom(passend, venster) };
    const w = zoomRond(passend, passend, { fx: 0.5, fy: 0.5 }, 1000, venster, grenzen);
    expect(venster.breedte / w.b).toBeCloseTo(2, 9);
  });
});

describe("pinch", () => {
  const RECT = { left: 100, top: 50, width: 1000, height: 500 };
  const PASSEND: Weergave = { x: -2000, y: 0, b: 12000, h: 6000 };

  test("zonder beweging blijft de weergave gelijk", () => {
    const start = { a: { x: 300, y: 200 }, b: { x: 700, y: 400 } };
    const w = pinch(PASSEND, PASSEND, start, start, RECT, GRENZEN);
    expect(w.x).toBeCloseTo(PASSEND.x, 9);
    expect(w.y).toBeCloseTo(PASSEND.y, 9);
    expect(w.b).toBeCloseTo(PASSEND.b, 9);
    expect(w.h).toBeCloseTo(PASSEND.h, 9);
  });

  test("vingers twee keer zo ver uit elkaar zoomt 2x in rond het midden", () => {
    // Midden (600, 300) op het scherm = fractie (0.5, 0.5) = inhoud (4000, 3000).
    const start = { a: { x: 500, y: 300 }, b: { x: 700, y: 300 } };
    const nu = { a: { x: 400, y: 300 }, b: { x: 800, y: 300 } };
    const w = pinch(PASSEND, PASSEND, start, nu, RECT, GRENZEN);
    expect(w.b).toBeCloseTo(6000, 9);
    expect(w.h).toBeCloseTo(3000, 9);
    expect(w.x + 0.5 * w.b).toBeCloseTo(4000, 9);
    expect(w.y + 0.5 * w.h).toBeCloseTo(3000, 9);
  });

  test("het midden pant mee: het inhoudspunt onder het startmidden volgt de vingers", () => {
    const start = { a: { x: 200, y: 150 }, b: { x: 400, y: 150 } };
    // Zelfde afstand, midden 100 px naar rechts en 50 px naar beneden.
    const nu = { a: { x: 300, y: 200 }, b: { x: 500, y: 200 } };
    const w = pinch(PASSEND, PASSEND, start, nu, RECT, GRENZEN);
    const onder = schermNaarInhoud(300, 150, RECT, PASSEND);
    const nuOnder = schermNaarInhoud(400, 200, RECT, w);
    expect(w.b).toBeCloseTo(PASSEND.b, 9);
    expect(nuOnder.x).toBeCloseTo(onder.x, 9);
    expect(nuOnder.y).toBeCloseTo(onder.y, 9);
  });

  test("de zoom blijft binnen de grenzen", () => {
    const start = { a: { x: 590, y: 300 }, b: { x: 610, y: 300 } };
    const ver = { a: { x: 100, y: 300 }, b: { x: 1100, y: 300 } };
    expect(pinch(PASSEND, PASSEND, start, ver, RECT, GRENZEN).b).toBeCloseTo(PASSEND.b / MAX_ZOOM, 9);
    expect(pinch(PASSEND, PASSEND, ver, start, RECT, GRENZEN).b).toBeCloseTo(PASSEND.b / MIN_ZOOM, 9);
  });

  test("twee vingers op hetzelfde punt bij de start zoomen niet", () => {
    const start = { a: { x: 600, y: 300 }, b: { x: 600, y: 300 } };
    const nu = { a: { x: 500, y: 300 }, b: { x: 700, y: 300 } };
    const w = pinch(PASSEND, PASSEND, start, nu, RECT, GRENZEN);
    expect(Number.isFinite(w.b)).toBe(true);
    expect(w.b).toBeCloseTo(PASSEND.b, 9);
  });
});
