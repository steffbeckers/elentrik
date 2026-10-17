/** Franse berichtteksten per berichtSleutel; aangevuld door de regels (Task 13–15). */
export const FR: Readonly<Record<string, string>> = {
  "arei.algemeen-differentieel.ontbreekt": "L'installation ne comporte pas de différentiel général.",
  "arei.algemeen-differentieel.te-gevoelig-ingesteld":
    "Le différentiel général a une sensibilité de {gevoeligheid} mA. Au-delà de {max} mA, ce n'est pas admis.",
  "arei.natte-ruimte-differentieel.ontbreekt":
    "Ce point ({reden}) n'est pas protégé par un différentiel de {max} mA maximum.",
  "arei.doorsnede-beveiliging.te-hoog":
    "La protection de {nominaal} A est trop élevée pour un câble de {doorsnede} mm². Maximum {max} A.",
  "arei.doorsnede-beveiliging.onbekende-doorsnede":
    "Aucune protection maximale n'est connue pour une section de {doorsnede} mm². Vérifiez-le manuellement.",
};
