/** Franse berichtteksten per berichtSleutel; dezelfde sleutels en plaatshouders als `nl.ts`. De termen volgen `docs/vertalingen.md`. */
export const FR: Readonly<Record<string, string>> = {
  "arei.differentieel.aanvullend.ontbreekt": "Ce point ordinaire (prise de courant ou point lumineux) manque de protection différentielle complémentaire de maximum 30 mA pour une nouvelle installation domestique.",
  "arei.differentieel.aanvullend.context": "Ce point ordinaire (prise de courant ou point lumineux) ne dispose pas de protection complémentaire de maximum 30 mA. Vérifiez le contexte et les dispositions transitoires ; une installation existante n’est pas automatiquement exemptée.",
  "waarde.hal": "hall",
  "arei.differentieel.algemeen.ontbreekt": "L'installation ne comporte pas d'interrupteur différentiel général.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "L'interrupteur différentiel général a une sensibilité de {gevoeligheid} mA. Une sensibilité supérieure à {max} mA n'est pas admise.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "Ce point ({reden}) n'est pas protégé par un interrupteur différentiel de {max} mA maximum.",
  "arei.kring.doorsnede-beveiliging.te-hoog-automaat":
    "Le disjoncteur de {nominaal} A est trop élevé pour un câble de {doorsnede} mm². Maximum {max} A pour un disjoncteur.",
  "arei.kring.doorsnede-beveiliging.te-hoog-zekering":
    "Le fusible de {nominaal} A est trop élevé pour un câble de {doorsnede} mm². Maximum {max} A pour un fusible.",
  "arei.kring.doorsnede-beveiliging.onbekende-doorsnede":
    "Aucune protection maximale n'est connue pour une section de {doorsnede} mm². Vérifiez-le manuellement.",
  "arei.kring.max-contactdozen.overschreden":
    "Le circuit {kring} compte {aantal} prises. Maximum admis\u00a0: {max}.",
  "arei.kring.min-doorsnede.contactdozen":
    "Le circuit {kring} alimente des prises avec un câble de {doorsnede} mm². Minimum requis\u00a0: {min} mm².",
  "arei.kring.min-doorsnede.verlichting":
    "Le circuit {kring} alimente de l'éclairage avec un câble de {doorsnede} mm². Minimum requis\u00a0: {min} mm².",
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
  "arei.differentieel.max-stroombanen.overschreden":
    "Cet interrupteur différentiel de {gevoeligheid} mA protège {aantal} circuits. Dans une nouvelle installation domestique, le maximum admis est de {max} par interrupteur différentiel.",
  "arei.differentieel.max-stroombanen.context":
    "Cet interrupteur différentiel de {gevoeligheid} mA protège {aantal} circuits. Depuis le 1er juin 2023, le maximum admis est de {max} par interrupteur différentiel. Vérifiez le contexte de l'installation et les dispositions transitoires\u00a0; une installation existante n'est pas automatiquement exemptée.",
  "arei.differentieel.type-ac.niet-toegelaten":
    "Cet interrupteur différentiel est de type AC. Ce type n'est pas admis dans une nouvelle installation domestique\u00a0; choisissez au moins le type A.",
  "arei.differentieel.type-ac.context":
    "Cet interrupteur différentiel est de type AC. Ce type n'est plus admis dans les nouvelles installations. Vérifiez le contexte de l'installation et les dispositions transitoires\u00a0; une installation existante n'est pas automatiquement exemptée.",
  "arei.aarding.spreidingsweerstand.te-weinig-differentielen":
    "La résistance de dispersion dépasse 30 Ω. Il faut alors au moins {min} interrupteurs différentiels de 30 mA maximum\u00a0; le schéma en compte {aantal}.",
  "arei.aarding.spreidingsweerstand.te-veel-contactdozen":
    "La résistance de dispersion dépasse 30 Ω. Cet interrupteur différentiel protège {aantal} prises de courant et appareils fixes\u00a0; le maximum admis est alors de {max}.",
  "arei.aarding.spreidingsweerstand.kring-onbeschermd":
    "La résistance de dispersion dépasse 30 Ω. Le circuit {kring} doit alors être protégé par un interrupteur différentiel de {max} mA maximum, en plus de l'interrupteur différentiel général.",
  "arei.laadpaal.differentieel.ontbreekt":
    "Cette borne de recharge n'est pas protégée par son propre interrupteur différentiel de {max} mA maximum. L'interrupteur différentiel général ne compte pas.",
  "arei.laadpaal.differentieel.type":
    "L'interrupteur différentiel de cette borne de recharge n'est pas de type B et la borne n'a pas de détection de courant résiduel DC de {max} mA maximum. Choisissez un interrupteur différentiel de type B ou renseignez la détection de courant résiduel DC de la borne.",
  "arei.verlichting.min-kringen.een-kring":
    "Tous les points lumineux sont sur le circuit {kring}. Répartissez l'éclairage sur au moins {min} circuits, afin que tout ne s'éteigne pas en même temps.",
  "arei.contactdoos.uitvoering.randaarde":
    "Cette prise de courant n'a pas de contact de terre. Dans une nouvelle installation, chaque prise de courant doit en avoir un.",
  "arei.contactdoos.uitvoering.kinderbeveiliging":
    "Cette prise de courant n'a pas de sécurité enfants. Dans une nouvelle installation domestique, chaque prise de courant doit en être équipée.",
  "arei.aarding.niet-getekend.beide":
    "Le schéma ne montre pas encore la mise à la terre. Ajoutez le sectionneur de terre et la prise de terre.",
  "arei.aarding.niet-getekend.aardingsonderbreker":
    "Le schéma montre une prise de terre mais pas encore de sectionneur de terre.",
  "arei.aarding.niet-getekend.aardelektrode":
    "Le schéma montre un sectionneur de terre mais pas encore de prise de terre.",
  "arei.kring.spanningsval.te-hoog":
    "La chute de tension estimée du circuit {kring} est de {spanningsval}\u00a0%, au-dessus de la valeur indicative de {max}\u00a0%. Il s'agit d'une valeur indicative, pas d'une exigence du RGIE\u00a0; envisagez une section plus grande.",
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
  "waarde.pvPaneel": "panneau photovoltaïque",
  "waarde.deurbelMonitor": "carillon / moniteur",
  "waarde.bel": "sonnerie",
  "waarde.motor": "moteur",
  "waarde.ventilator": "ventilateur",
  "waarde.koelkast": "réfrigérateur",
  "waarde.diepvriezer": "congélateur",
  "waarde.onbekendDrieblad": "Symbole source inconnu (trois pales)",
  "waarde.andere": "autre",
};
