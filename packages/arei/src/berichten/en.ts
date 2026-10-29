/** Engelse berichtteksten per berichtSleutel; dezelfde sleutels en plaatshouders als `nl.ts`. */
export const EN: Readonly<Record<string, string>> = {
  "arei.differentieel.algemeen.ontbreekt": "The installation has no main RCD.",
  "arei.differentieel.algemeen.te-ongevoelig":
    "The main RCD has a sensitivity of {gevoeligheid} mA. More than {max} mA is not permitted.",
  "arei.differentieel.natte-ruimte.ontbreekt":
    "This point ({reden}) is not behind an RCD of {max} mA or less.",
  "arei.kring.doorsnede-beveiliging.te-hoog":
    "The protection of {nominaal} A is too high for a cable of {doorsnede} mm². Maximum {max} A.",
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
  "waarde.andere": "other",
};
