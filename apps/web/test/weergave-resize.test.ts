import { expect, test } from "vitest";
import { passendeWeergave, weergaveNaResize } from "../app/editor/weergave";

const inhoud = { breedte: 1000, hoogte: 800 };
const breed = { breedte: 900, hoogte: 600 };
const smal = { breedte: 390, hoogte: 100 };

test("een passend plan blijft volledig zichtbaar als opmaak het venster verkleint", () => {
  const passend = passendeWeergave(inhoud, breed, 20)!;
  expect(weergaveNaResize(passend, breed, smal, inhoud, 20)).toEqual(passendeWeergave(inhoud, smal, 20));
});

test("een zelf ingezoomd plan behoudt schaal en middelpunt bij resize", () => {
  const w = { x: 100, y: 100, b: 450, h: 300 };
  const nieuw = weergaveNaResize(w, breed, smal, inhoud, 20);
  expect(nieuw.b / smal.breedte).toBe(w.b / breed.breedte);
  expect(nieuw.h / smal.hoogte).toBe(w.h / breed.hoogte);
  expect(nieuw.x + nieuw.b / 2).toBe(w.x + w.b / 2);
  expect(nieuw.y + nieuw.h / 2).toBe(w.y + w.h / 2);
});

test("verborgen vensters bewaren de vorige weergave", () => {
  const w = passendeWeergave(inhoud, breed, 20)!;
  expect(weergaveNaResize(w, breed, { breedte: 0, hoogte: 0 }, inhoud, 20)).toBe(w);
});

test("een verschoven weergave wordt begrensd zonder terug te springen naar passend", () => {
  const nieuw = weergaveNaResize({ x: -10000, y: -10000, b: 450, h: 300 }, breed, smal, inhoud, 20);
  expect(nieuw.x + nieuw.b / 2).toBe(0);
  expect(nieuw.y + nieuw.h / 2).toBe(0);
  expect(nieuw.b).toBe(195);
});
