import { setResponseStatus } from "h3";
import { bewaarLogo } from "../../bedrijf/repo";
import { gebruikOpslag } from "../../bestanden/opslag";
import { gebruikDb } from "../../db";
import { leesLogoUpload, metBestandFouten } from "../../utils/bestanden";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Alleen een eigenaar laadt het logo van de actieve organisatie op.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const db = gebruikDb();
  const data = await leesLogoUpload(event, { db, organisatieId });
  const info = await metBestandFouten(() => bewaarLogo(db, gebruikOpslag(), organisatieId, data));
  setResponseStatus(event, 201);
  return info;
});
