/** Nederlandse berichtteksten per berichtSleutel; aangevuld door de regels (Task 13–15). */
export const NL: Readonly<Record<string, string>> = {
  "arei.algemeen-differentieel.ontbreekt": "De installatie heeft geen algemeen differentieel.",
  "arei.algemeen-differentieel.te-gevoelig-ingesteld":
    "Het algemeen differentieel heeft een gevoeligheid van {gevoeligheid} mA. Meer dan {max} mA is niet toegestaan.",
  "arei.natte-ruimte-differentieel.ontbreekt":
    "Dit punt ({reden}) hangt niet achter een differentieel van maximaal {max} mA.",
  "arei.doorsnede-beveiliging.te-hoog":
    "De beveiliging van {nominaal} A is te hoog voor een leiding van {doorsnede} mm². Maximaal {max} A.",
  "arei.doorsnede-beveiliging.onbekende-doorsnede":
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
};
