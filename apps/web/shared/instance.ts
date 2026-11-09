// De melding van de instance-ping: wat een instance over zichzelf doorgeeft, en de validatie
// ervan aan de ontvangende kant. Expliciet geïmporteerd (ruling E1).
import { z } from "zod";
import { isIp } from "../server/net";

export type InstanceMelding = {
  instanceId: string;
  host: string;
  versie: string;
  abonnementenAan: boolean;
  aantalOrganisaties: number;
  aantalGebruikers: number;
};

const HOSTNAAM = /^[a-z0-9.-]+$/;
const aantal = z.number().int().min(0).max(10_000_000);

export const instanceMeldingSchema = z.strictObject({
  instanceId: z.string().uuid(),
  host: z
    .string()
    .min(1)
    .max(253)
    .refine((host) => HOSTNAAM.test(host) || isIp(host)),
  versie: z.string().min(1).max(64),
  abonnementenAan: z.boolean(),
  aantalOrganisaties: aantal,
  aantalGebruikers: aantal,
});

/** Leest een ontvangen melding; `null` als de invoer niet klopt. */
export function leesInstanceMelding(invoer: unknown): InstanceMelding | null {
  const resultaat = instanceMeldingSchema.safeParse(invoer);
  return resultaat.success ? resultaat.data : null;
}
