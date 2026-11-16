/** Nederlandse berichtteksten per berichtSleutel; aangevuld door de regels (Task 13–15); `waarde.*` vertaalt ruimtes en toestelsoorten in parameters. */
export const NL: Readonly<Record<string, string>> = {
  "arei.differentieel.aanvullend.ontbreekt": "Dit gewone punt (contactdoos of lichtpunt) mist aanvullende differentieelbescherming van maximaal 30 mA voor een nieuwe huishoudelijke installatie.",
  "arei.differentieel.aanvullend.context": "Dit gewone punt (contactdoos of lichtpunt) heeft geen aanvullende bescherming van maximaal 30 mA. Controleer de installatiecontext en eventuele overgangsbepalingen; een bestaande installatie is niet automatisch vrijgesteld.",
  "waarde.hal": "hal",
  "arei.differentieel.algemeen.ontbreekt": "De installatie heeft geen algemeen differentieel.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "Het algemeen differentieel heeft een gevoeligheid van {gevoeligheid} mA. Meer dan {max} mA is niet toegestaan.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "Dit punt ({reden}) hangt niet achter een differentieel van maximaal {max} mA.",
  "arei.kring.doorsnede-beveiliging.te-hoog-automaat":
    "De automaat van {nominaal} A is te hoog voor een leiding van {doorsnede} mm². Maximaal {max} A voor een automaat.",
  "arei.kring.doorsnede-beveiliging.te-hoog-zekering":
    "De zekering van {nominaal} A is te hoog voor een leiding van {doorsnede} mm². Maximaal {max} A voor een zekering.",
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
  "arei.differentieel.max-stroombanen.overschreden":
    "Achter dit differentieel van {gevoeligheid} mA zitten {aantal} kringen. In een nieuwe huishoudelijke installatie zijn er maximaal {max} per differentieel toegelaten.",
  "arei.differentieel.max-stroombanen.context":
    "Achter dit differentieel van {gevoeligheid} mA zitten {aantal} kringen. Sinds 1 juni 2023 zijn er maximaal {max} per differentieel toegelaten. Controleer de installatiecontext en eventuele overgangsbepalingen; een bestaande installatie is niet automatisch vrijgesteld.",
  "arei.differentieel.type-ac.niet-toegelaten":
    "Dit differentieel is van het type AC. Dat type is niet toegelaten in een nieuwe huishoudelijke installatie; kies minstens type A.",
  "arei.differentieel.type-ac.context":
    "Dit differentieel is van het type AC. Dat type is niet meer toegelaten in nieuwe installaties. Controleer de installatiecontext en eventuele overgangsbepalingen; een bestaande installatie is niet automatisch vrijgesteld.",
  "arei.aarding.spreidingsweerstand.te-weinig-differentielen":
    "De aardingsweerstand ligt boven 30 Ω. Dan zijn minstens {min} differentiëlen van maximaal 30 mA nodig; het schema heeft er {aantal}.",
  "arei.aarding.spreidingsweerstand.te-veel-contactdozen":
    "De aardingsweerstand ligt boven 30 Ω. Achter dit differentieel zitten {aantal} contactdozen en vaste toestellen; dan zijn er maximaal {max} toegelaten.",
  "arei.aarding.spreidingsweerstand.kring-onbeschermd":
    "De aardingsweerstand ligt boven 30 Ω. Dan hoort kring {kring} achter een differentieel van maximaal {max} mA, naast het algemeen differentieel.",
  "arei.laadpaal.differentieel.ontbreekt":
    "Deze laadpaal hangt niet achter een eigen differentieel van maximaal {max} mA. Het algemeen differentieel telt daarvoor niet.",
  "arei.laadpaal.differentieel.type":
    "Het differentieel van deze laadpaal is geen type B en de laadpaal heeft geen DC-foutstroomdetectie van maximaal {max} mA. Kies een differentieel van type B of vul de DC-foutstroomdetectie van de laadpaal in.",
  "arei.verlichting.min-kringen.een-kring":
    "Alle lichtpunten zitten op kring {kring}. Verdeel de verlichting over minstens {min} kringen, zodat niet alles tegelijk uitvalt.",
  "arei.contactdoos.uitvoering.randaarde":
    "Deze contactdoos heeft geen randaarde. In een nieuwe installatie hoort elke contactdoos een randaarde te hebben.",
  "arei.contactdoos.uitvoering.kinderbeveiliging":
    "Deze contactdoos heeft geen kinderbeveiliging. In een nieuwe huishoudelijke installatie hoort elke contactdoos kinderbeveiliging te hebben.",
  "arei.aarding.niet-getekend.beide":
    "Het schema toont nog geen aarding. Voeg de aardingsonderbreker en de aardelektrode toe.",
  "arei.aarding.niet-getekend.aardingsonderbreker":
    "Het schema toont een aardelektrode maar nog geen aardingsonderbreker.",
  "arei.aarding.niet-getekend.aardelektrode":
    "Het schema toont een aardingsonderbreker maar nog geen aardelektrode.",
  "arei.kring.spanningsval.te-hoog":
    "De geschatte spanningsval van kring {kring} is {spanningsval} %, boven de richtwaarde van {max} %. Dit is een richtwaarde, geen AREI-eis; overweeg een grotere doorsnede.",
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
  "waarde.pvPaneel": "fotovoltaïsch paneel",
  "waarde.deurbelMonitor": "deurbel / monitor",
  "waarde.bel": "bel",
  "waarde.motor": "motor",
  "waarde.ventilator": "ventilator",
  "waarde.koelkast": "koelkast",
  "waarde.diepvriezer": "diepvriezer",
  "waarde.onbekendDrieblad": "Onbekend bronsymbool (drieblad)",
  "waarde.andere": "andere",
};
