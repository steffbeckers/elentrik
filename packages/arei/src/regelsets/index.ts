import type { Regelset } from "../types";
import { AREI_2020 } from "./arei-2020/index";

export const REGELSETS: Readonly<Record<string, Regelset>> = {
  "arei-2020@1": AREI_2020,
};

export function haalRegelset(sleutel: string): Regelset {
  const set = Object.hasOwn(REGELSETS, sleutel) ? REGELSETS[sleutel] : undefined;
  if (set === undefined) throw new Error(`ONBEKENDE_REGELSET: ${sleutel}`);
  return set;
}
