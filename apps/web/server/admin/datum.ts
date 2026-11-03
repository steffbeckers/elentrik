import { maakFout } from "../fouten";
import { LOCALES } from "../../shared/taal";

const kalender = new Intl.DateTimeFormat(LOCALES.en, { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" });
export function brusselseDatum(nu: Date): string {
  const delen = Object.fromEntries(kalender.formatToParts(nu).map((p) => [p.type, p.value]));
  return `${delen.year}-${delen.month}-${delen.day}`;
}
export function eisKalenderdatum(datum: string): string {
  const d = new Date(`${datum}T00:00:00.000Z`);
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== datum) {
    throw maakFout(400, "Ongeldige kalenderdatum", "ONGELDIGE_INVOER");
  }
  return datum;
}
/** Inclusieve einddag voor de beheerder; het schrijfrecht vervalt de volgende Brusselse middernacht. */
export function proefEindeVoorDatum(datum: string): Date {
  eisKalenderdatum(datum);
  const volgendeDag = new Date(`${datum}T00:00:00Z`).getTime() + 86400000;
  const formaat = new Intl.DateTimeFormat(LOCALES.en, { timeZone: "Europe/Brussels", timeZoneName: "longOffset" });
  // Op UTC-middernacht geldt in Brussel dezelfde offset als op de lokale middernacht ervoor,
  // ook op de wisseldag: de zomertijdwissel gebeurt pas later die nacht.
  const zone = formaat.formatToParts(new Date(volgendeDag)).find((p) => p.type === "timeZoneName")!.value;
  const match = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(zone);
  if (!match) throw maakFout(400, "Ongeldige kalenderdatum", "ONGELDIGE_INVOER");
  // Historische datums kunnen GMT of een offset met seconden opleveren. Ook die
  // bereiken de gewone validatie die een proefverlenging in het verleden afwijst.
  const seconden = (Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0)) * (match[1] === "-" ? -1 : 1);
  return new Date(volgendeDag - seconden * 1000);
}
