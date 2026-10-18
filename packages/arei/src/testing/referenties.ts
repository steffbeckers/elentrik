import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { installatie, type BordBouwer } from "./bouwer";

/** Gemeenschappelijk deel van de referenties: de kringen van het appartement. */
function appartementKringen(b: BordBouwer): void {
  b.kring((k) => k.automaat(20).leiding(2.5).contactdozen(6, { ruimte: "leefruimte" }))
    .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(5))
    .kring((k) => k.automaat(32).leiding(6).toestel("kookplaat", { ruimte: "keuken" }))
    .differentieel(30, (n) =>
      n
        .kring((k) => k.automaat(20).leiding(2.5).toestel("wasmachine", { ruimte: "wasplaats" }))
        .kring((k) => k.automaat(16).leiding(2.5).contactdozen(2, { ruimte: "badkamer" })),
    );
}

/** Appartement: één differentieel van 300 mA met de appartementkringen. */
export function referentieAppartement(): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) => d.verdeelbord(appartementKringen))
    .bouw().doc;
}

/** Rijwoning met de benoemde kring `rij` (9 contactdozen, dus één fout tegen de maximumregel). */
export function referentieRijwoningMetIds(): { doc: InstallatieDocument; ids: Record<string, NodeId> } {
  return installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) => {
        appartementKringen(b);
        b.kring((k) => k.automaat(20).als("rij").leiding(2.5).contactdozen(9, { ruimte: "leefruimte" }));
      }),
    )
    .bouw();
}

/** Rijwoning: het appartement plus een kring met 9 contactdozen. */
export function referentieRijwoning(): InstallatieDocument {
  return referentieRijwoningMetIds().doc;
}

/**
 * Hoofdbord met drie kringen. Kring C voedt het onderbord "Garage" met twee kringen van elk 4
 * contactdozen (puntlabels "Garage.A1" … "Garage.B4"). Kring B ernaast heeft 8 lichtpunten, zodat
 * lange labels van het onderbord naast een lange keten staan.
 */
export function referentieMetOnderbord(): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .kring((k) => k.automaat(20).leiding(2.5).contactdozen(4, { ruimte: "leefruimte" }))
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(8))
          .kring((k) =>
            k
              .automaat(40)
              .leiding(10)
              .onderbord(
                (o) =>
                  o
                    .kring((k2) => k2.automaat(20).leiding(2.5).contactdozen(4))
                    .kring((k2) => k2.automaat(16).leiding(2.5).contactdozen(4)),
                "Garage",
              ),
          ),
      ),
    )
    .bouw().doc;
}

/** Woning (3N400V) met laadpaal en omvormer, zonder fouten of waarschuwingen. */
export function referentieWoning(): InstallatieDocument {
  return installatie({ stroomtype: "3N400V" })
    .differentieel(
      300,
      (d) =>
        d.verdeelbord((b) => {
          appartementKringen(b);
          b.kring((k) => k.automaat(32, { polen: 4 }).leiding(10).toestel("laadpaal"));
          b.kring((k) => k.automaat(20).leiding(4).toestel("omvormer"));
        }),
      { polen: 4 },
    )
    .bouw().doc;
}
