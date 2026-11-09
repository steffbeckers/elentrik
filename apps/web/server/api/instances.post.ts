// POST /api/instances: de ontvangende kant van de instance-ping. Alleen op elentrik.app
// (ELENTRIK_OMGEVING=productie); elke andere omgeving antwoordt 404. Publiek en zonder sessie: een
// instance stuurt dit server-naar-server. Het antwoord is 204, ook boven het dagplafond.
//
// Volgorde: omgeving (404), limiet per IP (429), grootte (413), inhoud (400), opslaan (204).
import { getRequestHeader, readRawBody, setResponseStatus } from "h3";
import { leesInstanceMelding } from "../../shared/instance";
import { leesOmgeving } from "../../shared/omgeving";
import { verzoekIp } from "../auth/ip";
import { gebruikDb } from "../db";
import { maakFout } from "../fouten";
import { maakLimiet, slaMeldingOp } from "../instance/ontvangst";
import { ipLimietSleutel } from "../net";
import { defineBeveiligdeHandler } from "../utils/toegang";

const MAX_BYTES = 2048;
const limiet = maakLimiet();

export default defineBeveiligdeHandler(
  async (event) => {
    if (leesOmgeving(process.env) !== "productie") {
      throw maakFout(404, "Niet beschikbaar", "INSTANCE_ONBEKEND");
    }
    const ip = verzoekIp(event);
    if (!limiet(ipLimietSleutel(ip), Date.now())) {
      throw maakFout(429, "Te veel meldingen", "INSTANCE_TE_VEEL");
    }
    // Een aangekondigde lengte boven de grens weigeren we zonder het lichaam te lezen.
    if (Number(getRequestHeader(event, "content-length") ?? 0) > MAX_BYTES) {
      throw maakFout(413, "Melding te groot", "INSTANCE_TE_GROOT");
    }
    const ruw = await readRawBody(event, false);
    if (ruw !== undefined && ruw.length > MAX_BYTES) {
      throw maakFout(413, "Melding te groot", "INSTANCE_TE_GROOT");
    }
    let invoer: unknown;
    try {
      invoer = JSON.parse(ruw?.toString("utf8") ?? "");
    } catch {
      throw maakFout(400, "Ongeldige melding", "INSTANCE_ONGELDIG");
    }
    const melding = leesInstanceMelding(invoer);
    if (!melding) throw maakFout(400, "Ongeldige melding", "INSTANCE_ONGELDIG");

    await slaMeldingOp(gebruikDb(), melding, ip ?? null, new Date());
    setResponseStatus(event, 204);
    return null;
  },
  { publiek: true },
);
