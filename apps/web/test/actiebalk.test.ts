import { describe, expect, test } from "vitest";
import { ACTIEBALK_RAND_PX, actiebalkAfmeting, actiebalkPlaats } from "../app/editor/actiebalk";

// Het venster is 1000 × 600 px en toont 250 × 150 mm: 4 px per mm.
const venster = { breedte: 1000, hoogte: 600 };
const weergave = { x: 0, y: 0, b: 250, h: 150 };
const balk = actiebalkAfmeting(4);
const vak = (x: number, y: number, breedte = 8, hoogte = 8) => ({ x, y, breedte, hoogte });

describe("actiebalkAfmeting", () => {
  test("een smalle verticale balk: één knop breed, zo hoog als het aantal knoppen", () => {
    expect(actiebalkAfmeting(1)).toEqual({ breedte: 48, hoogte: 48 });
    expect(actiebalkAfmeting(4)).toEqual({ breedte: 48, hoogte: 168 });
  });
});

describe("actiebalkPlaats", () => {
  test("zonder selectie of zonder venster is er geen balk", () => {
    expect(actiebalkPlaats([], weergave, venster, balk)).toBeNull();
    expect(actiebalkPlaats([vak(100, 50)], weergave, { breedte: 0, hoogte: 0 }, balk)).toBeNull();
  });

  test("rechts naast het onderdeel, bovenaan gelijk ermee, zonder de volgende kolom te raken", () => {
    // Vak 100..108 mm, midden 104. Minstens 3 mm voorbij de rand: 111 mm = 444 px. De voorkeur
    // (midden + 12 mm = 464 px) zou tot 512 px reiken, voorbij waar de volgende kolom kan beginnen
    // (midden + 14 mm = 472 px); uitgezoomd wint de afstand tot het eigen onderdeel.
    expect(actiebalkPlaats([vak(100, 50)], weergave, venster, balk)).toEqual({ x: 444, y: 200, bijSelectie: true });
  });

  test("ingezoomd schuift de balk op tot tegen de volgende kolom", () => {
    // 20 px per mm: midden + 14 mm = 2360 px, min de balk = 2312; de voorkeur is 2320 px.
    const groot = { breedte: 4000, hoogte: 2400 };
    expect(actiebalkPlaats([vak(100, 50)], { x: 0, y: 0, b: 200, h: 120 }, groot, balk)!.x).toBe(2312);
    // 40 px per mm: de voorkeur (midden + 12 mm = 4640 px) past ruim voor de volgende kolom.
    expect(actiebalkPlaats([vak(100, 50)], { x: 0, y: 0, b: 150, h: 90 }, { breedte: 6000, hoogte: 3600 }, balk)!.x).toBe(4640);
  });

  test("een breed onderdeel duwt de balk verder naar rechts dan een halve kolom", () => {
    // Vak van 100 tot 140 mm: rechterrand + 3 mm = 143 mm = 572 px.
    expect(actiebalkPlaats([vak(100, 50, 40, 8)], weergave, venster, balk)).toEqual({ x: 572, y: 200, bijSelectie: true });
  });

  test("meerdere onderdelen: naast de omhullende rechthoek", () => {
    const plaats = actiebalkPlaats([vak(100, 50), vak(100, 20), vak(130, 50)], weergave, venster, balk)!;
    // Omhullende: x 100..138, y 20..58: 3 mm voorbij de rechterrand is 141 mm = 564 px.
    expect(plaats).toEqual({ x: 564, y: 80, bijSelectie: true });
  });

  test("geen plaats rechts: de balk gaat naar links van het onderdeel", () => {
    // Vak 240..248 mm tegen de rechterrand: 3 mm links van het vak is 237 mm = 948 px, min de balk.
    const plaats = actiebalkPlaats([vak(240, 50)], weergave, venster, balk)!;
    expect(plaats.x).toBe(900);
    expect(plaats.bijSelectie).toBe(true);
  });

  test("de balk blijft binnen het venster en boven de zoomknoppen", () => {
    const onderaan = actiebalkPlaats([vak(100, 140)], weergave, venster, balk)!;
    expect(onderaan.y).toBe(600 - balk.hoogte - 56);
    const bovenaan = actiebalkPlaats([vak(100, -1)], weergave, venster, balk)!;
    expect(bovenaan.y).toBe(ACTIEBALK_RAND_PX);
  });

  test("een selectie buiten beeld: de balk staat vast linksboven", () => {
    expect(actiebalkPlaats([vak(400, 50)], weergave, venster, balk)).toEqual({
      x: ACTIEBALK_RAND_PX,
      y: ACTIEBALK_RAND_PX,
      bijSelectie: false,
    });
    expect(actiebalkPlaats([vak(100, 300)], weergave, venster, balk)!.bijSelectie).toBe(false);
  });

  test("ingezoomd en verschoven: de plaats volgt de weergave", () => {
    // 100 × 60 mm zichtbaar vanaf (80, 40): 10 px per mm. Volgende kolom: (104 + 14 - 80) × 10 - 48 = 332.
    expect(actiebalkPlaats([vak(100, 50)], { x: 80, y: 40, b: 100, h: 60 }, venster, balk)).toEqual({
      x: 332,
      y: 100,
      bijSelectie: true,
    });
  });
});
