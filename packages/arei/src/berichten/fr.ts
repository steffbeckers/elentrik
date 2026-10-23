/** Franse berichtteksten per berichtSleutel; dezelfde sleutels en plaatshouders als `nl.ts`. De termen volgen `docs/vertalingen.md`. */
export const FR: Readonly<Record<string, string>> = {
  "arei.differentieel.algemeen.ontbreekt": "L'installation ne comporte pas d'interrupteur différentiel général.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "L'interrupteur différentiel général a une sensibilité de {gevoeligheid} mA. Une sensibilité supérieure à {max} mA n'est pas admise.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "Ce point ({reden}) n'est pas protégé par un interrupteur différentiel de {max} mA maximum.",
  "arei.kring.doorsnede-beveiliging.te-hoog":
    "La protection de {nominaal} A est trop élevée pour un câble de {doorsnede} mm². Maximum {max} A.",
  "arei.kring.doorsnede-beveiliging.onbekende-doorsnede":
    "Aucune protection maximale n'est connue pour une section de {doorsnede} mm². Vérifiez-le manuellement.",
  "arei.kring.max-contactdozen.overschreden":
    "Le circuit {kring} compte {aantal} prises. Maximum admis : {max}.",
  "arei.kring.min-doorsnede.contactdozen":
    "Le circuit {kring} alimente des prises avec un câble de {doorsnede} mm². Minimum requis : {min} mm².",
  "arei.kring.min-doorsnede.verlichting":
    "Le circuit {kring} alimente de l'éclairage avec un câble de {doorsnede} mm². Minimum requis : {min} mm².",
  "arei.toestel.eigen-kring.gedeeld":
    "Un appareil ({toestel}) doit avoir son propre circuit, mais le circuit {kring} alimente aussi d'autres points.",
  "arei.polen.stroomtype.algemeen":
    "L'interrupteur différentiel général a {polen} pôles, alors que {verwacht} pôles sont attendus pour le type de courant {stroomtype}.",
  "arei.polen.stroomtype.te-veel":
    "Cette protection a {polen} pôles, plus que nécessaire pour le type de courant {stroomtype}.",
  "arei.situatie.niet-geplaatst.punt": "Le point {label} n'est pas encore placé sur un plan de position.",
  "arei.leiding.onvolledig.kabeltype": "Le type de ce câble n'est pas encore renseigné.",
  "arei.leiding.onvolledig.doorsnede": "La section de ce câble n'est pas encore renseignée.",
  "arei.punt.zonder-beveiliging.ontbreekt":
    "Ce point n'est pas alimenté par un disjoncteur ou un fusible dans un tableau de distribution.",
  "waarde.badkamer": "salle de bain",
  "waarde.keuken": "cuisine",
  "waarde.wasplaats": "buanderie",
  "waarde.slaapkamer": "chambre",
  "waarde.leefruimte": "pièce de vie",
  "waarde.garage": "garage",
  "waarde.kelder": "cave",
  "waarde.zolder": "grenier",
  "waarde.buiten": "extérieur",
  "waarde.technisch": "local technique",
  "waarde.wasmachine": "lave-linge",
  "waarde.droogkast": "sèche-linge",
  "waarde.vaatwasser": "lave-vaisselle",
  "waarde.kookplaat": "plaque de cuisson",
  "waarde.oven": "four",
  "waarde.boiler": "chauffe-eau",
  "waarde.warmtepomp": "pompe à chaleur",
  "waarde.laadpaal": "borne de recharge",
  "waarde.omvormer": "onduleur",
  "waarde.andere": "autre",
};
