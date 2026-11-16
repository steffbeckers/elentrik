/** Engelse berichtteksten per berichtSleutel; dezelfde sleutels en plaatshouders als `nl.ts`. */
export const EN: Readonly<Record<string, string>> = {
  "arei.differentieel.aanvullend.ontbreekt": "This ordinary point (socket outlet or lighting point) lacks additional residual-current protection of at most 30 mA for a new domestic installation.",
  "arei.differentieel.aanvullend.context": "This ordinary point (socket outlet or lighting point) has no additional protection of at most 30 mA. Check the installation context and transitional provisions; an existing installation is not automatically exempt.",
  "waarde.hal": "hall",
  "arei.differentieel.algemeen.ontbreekt": "The installation has no main RCD.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "The main RCD has a sensitivity of {gevoeligheid} mA. More than {max} mA is not permitted.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "This point ({reden}) is not behind an RCD of {max} mA or less.",
  "arei.kring.doorsnede-beveiliging.te-hoog-automaat":
    "The circuit breaker of {nominaal} A is too high for a cable of {doorsnede} mm². Maximum {max} A for a circuit breaker.",
  "arei.kring.doorsnede-beveiliging.te-hoog-zekering":
    "The fuse of {nominaal} A is too high for a cable of {doorsnede} mm². Maximum {max} A for a fuse.",
  "arei.kring.doorsnede-beveiliging.onbekende-doorsnede":
    "No maximum protection is known for a cross-section of {doorsnede} mm². Please check this manually.",
  "arei.kring.max-contactdozen.overschreden":
    "Circuit {kring} has {aantal} sockets. Maximum permitted: {max}.",
  "arei.kring.min-doorsnede.contactdozen":
    "Circuit {kring} supplies sockets but has a cable of {doorsnede} mm². Minimum required: {min} mm².",
  "arei.kring.min-doorsnede.verlichting":
    "Circuit {kring} supplies lighting but has a cable of {doorsnede} mm². Minimum required: {min} mm².",
  "arei.toestel.eigen-kring.gedeeld":
    "An appliance ({toestel}) must be on its own circuit, but circuit {kring} also supplies other points.",
  "arei.polen.stroomtype.algemeen":
    "The main RCD has {polen} poles, but {verwacht} poles are expected for current type {stroomtype}.",
  "arei.polen.stroomtype.te-veel":
    "This protection has {polen} poles, more than needed for current type {stroomtype}.",
  "arei.situatie.niet-geplaatst.punt": "Point {label} has not yet been placed on a layout plan.",
  "arei.leiding.onvolledig.kabeltype": "The cable type of this cable has not been entered yet.",
  "arei.leiding.onvolledig.doorsnede": "The cross-section of this cable has not been entered yet.",
  "arei.punt.zonder-beveiliging.ontbreekt":
    "This point is not supplied by a circuit breaker or a fuse in a distribution board.",
  "arei.differentieel.max-stroombanen.overschreden":
    "There are {aantal} circuits behind this {gevoeligheid} mA RCD. In a new domestic installation, a maximum of {max} per RCD is permitted.",
  "arei.differentieel.max-stroombanen.context":
    "There are {aantal} circuits behind this {gevoeligheid} mA RCD. Since 1 June 2023, a maximum of {max} per RCD has been permitted. Check the installation context and transitional provisions; an existing installation is not automatically exempt.",
  "arei.differentieel.type-ac.niet-toegelaten":
    "This RCD is type AC. That type is not permitted in a new domestic installation; choose at least type A.",
  "arei.differentieel.type-ac.context":
    "This RCD is type AC. That type is no longer permitted in new installations. Check the installation context and transitional provisions; an existing installation is not automatically exempt.",
  "arei.aarding.spreidingsweerstand.te-weinig-differentielen":
    "The earth resistance is above 30 Ω. At least {min} RCDs of 30 mA or less are then required; the diagram has {aantal}.",
  "arei.aarding.spreidingsweerstand.te-veel-contactdozen":
    "The earth resistance is above 30 Ω. There are {aantal} sockets and fixed appliances behind this RCD; the maximum permitted is then {max}.",
  "arei.aarding.spreidingsweerstand.kring-onbeschermd":
    "The earth resistance is above 30 Ω. Circuit {kring} must then be behind an RCD of {max} mA or less, in addition to the main RCD.",
  "arei.laadpaal.differentieel.ontbreekt":
    "This EV charger is not behind its own RCD of {max} mA or less. The main RCD does not count.",
  "arei.laadpaal.differentieel.type":
    "The RCD of this EV charger is not type B and the charger has no DC residual current detection of {max} mA or less. Choose a type B RCD or enter the charger's DC residual current detection.",
  "arei.verlichting.min-kringen.een-kring":
    "All light points are on circuit {kring}. Spread the lighting over at least {min} circuits so that it does not all fail at once.",
  "arei.contactdoos.uitvoering.randaarde":
    "This socket has no earth contact. In a new installation every socket should have one.",
  "arei.contactdoos.uitvoering.kinderbeveiliging":
    "This socket has no child protection. In a new domestic installation every socket should have it.",
  "arei.aarding.niet-getekend.beide":
    "The diagram does not show the earthing yet. Add the earth disconnector and the earth electrode.",
  "arei.aarding.niet-getekend.aardingsonderbreker":
    "The diagram shows an earth electrode but no earth disconnector yet.",
  "arei.aarding.niet-getekend.aardelektrode":
    "The diagram shows an earth disconnector but no earth electrode yet.",
  "arei.kring.spanningsval.te-hoog":
    "The estimated voltage drop of circuit {kring} is {spanningsval}%, above the guideline of {max}%. This is a guideline, not an AREI requirement; consider a larger cross-section.",
  "waarde.badkamer": "bathroom",
  "waarde.keuken": "kitchen",
  "waarde.wasplaats": "laundry room",
  "waarde.slaapkamer": "bedroom",
  "waarde.leefruimte": "living area",
  "waarde.garage": "garage",
  "waarde.kelder": "basement",
  "waarde.zolder": "attic",
  "waarde.buiten": "outdoors",
  "waarde.technisch": "technical room",
  "waarde.wasmachine": "washing machine",
  "waarde.droogkast": "tumble dryer",
  "waarde.vaatwasser": "dishwasher",
  "waarde.kookplaat": "hob",
  "waarde.oven": "oven",
  "waarde.boiler": "water heater",
  "waarde.warmtepomp": "heat pump",
  "waarde.laadpaal": "EV charger",
  "waarde.omvormer": "inverter",
  "waarde.pvPaneel": "photovoltaic panel",
  "waarde.deurbelMonitor": "doorbell / monitor",
  "waarde.bel": "bell",
  "waarde.motor": "motor",
  "waarde.ventilator": "fan",
  "waarde.koelkast": "refrigerator",
  "waarde.diepvriezer": "freezer",
  "waarde.onbekendDrieblad": "Unknown source symbol (three blades)",
  "waarde.andere": "other",
};
