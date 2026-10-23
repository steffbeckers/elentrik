import { setResponseStatus } from "h3";
import { bewaarLogo } from "../../bedrijf/repo";
import { gebruikOpslag } from "../../bestanden/opslag";
import { gebruikDb } from "../../db";
import { leesLogoUpload, metBestandFouten } from "../../utils/bestanden";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Alleen een eigenaar laadt het logo van de actieve organisatie op.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const data = await leesLogoUpload(event);
  const info = await metBestandFouten(() => bewaarLogo(gebruikDb(), gebruikOpslag(), organisatieId, data));
  setResponseStatus(event, 201);
  return info;
});
