/** Nederlandse berichtteksten per berichtSleutel; aangevuld door de regels (Task 13–15); `waarde.*` vertaalt ruimtes en toestelsoorten in parameters. */
export const NL: Readonly<Record<string, string>> = {
  "arei.differentieel.algemeen.ontbreekt": "De installatie heeft geen algemeen differentieel.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "Het algemeen differentieel heeft een gevoeligheid van {gevoeligheid} mA. Meer dan {max} mA is niet toegestaan.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "Dit punt ({reden}) hangt niet achter een differentieel van maximaal {max} mA.",
  "arei.kring.doorsnede-beveiliging.te-hoog":
    "De beveiliging van {nominaal} A is te hoog voor een leiding van {doorsnede} mm². Maximaal {max} A.",
  "arei.kring.doorsnede-beveiliging.onbekende-doorsnede":
    "Voor een leidingdoorsnede van {doorsnede} mm² is geen maximale beveiliging gekend. Controleer dit handmatig.",
  "arei.kring.max-contactdozen.overschreden":
    "Kring {kring} heeft {aantal} contactdozen. Maximaal {max} toegelaten.",
  "arei.kring.min-doorsnede.contactdozen":
    "Kring {kring} heeft contactdozen maar een leiding van {doorsnede} mm². Minimaal {min} mm² vereist.",
  "arei.kring.min-doorsnede.verlichting":
    "Kring {kring} heeft verlichting maar een leiding van {doorsnede} mm². Minimaal {min} mm² vereist.",
  "arei.toestel.eigen-kring.gedeeld":
    "Een {toestel} hoort op een eigen kring, maar kring {kring} voedt ook andere punten.",
  "arei.polen.stroomtype.algemeen":
    "Het algemeen differentieel heeft {polen} polen, maar bij stroomtype {stroomtype} worden {verwacht} polen verwacht.",
  "arei.polen.stroomtype.te-veel":
    "Deze beveiliging heeft {polen} polen, meer dan nodig bij stroomtype {stroomtype}.",
  "arei.situatie.niet-geplaatst.punt": "Punt {label} is nog niet op een situatieplan geplaatst.",
  "arei.leiding.onvolledig.kabeltype": "Bij deze leiding is het kabeltype nog niet ingevuld.",
  "arei.leiding.onvolledig.doorsnede": "Bij deze leiding is de doorsnede nog niet ingevuld.",
  "arei.punt.zonder-beveiliging.ontbreekt":
    "Dit punt hangt niet achter een automaat of zekering in een verdeelbord.",
  // Waarden die als parameter in een bericht staan (een ruimte of toestelsoort), zodat elke taal ze vertaalt.
  "waarde.badkamer": "badkamer",
  "waarde.keuken": "keuken",
  "waarde.wasplaats": "wasplaats",
  "waarde.slaapkamer": "slaapkamer",
  "waarde.leefruimte": "leefruimte",
  "waarde.garage": "garage",
  "waarde.kelder": "kelder",
  "waarde.zolder": "zolder",
  "waarde.buiten": "buiten",
  "waarde.technisch": "technisch",
  "waarde.wasmachine": "wasmachine",
  "waarde.droogkast": "droogkast",
  "waarde.vaatwasser": "vaatwasser",
  "waarde.kookplaat": "kookplaat",
  "waarde.oven": "oven",
  "waarde.boiler": "boiler",
  "waarde.warmtepomp": "warmtepomp",
  "waarde.laadpaal": "laadpaal",
  "waarde.omvormer": "omvormer",
  "waarde.andere": "andere",
};
