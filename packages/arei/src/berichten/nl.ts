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
};
