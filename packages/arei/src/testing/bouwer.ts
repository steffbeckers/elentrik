import {
  nieuwDocument,
  voegToe,
  type InstallatieDocument,
  type NodeId,
  type NodeInvoer,
  type Polen,
  type Ruimte,
  type Stroomtype,
  type Toestelsoort,
} from "@elentrik/model";

/**
 * Bouwer-DSL voor testinstallaties. Elke stap loopt rechtstreeks via `voegToe`
 * van het model, dus de uitvoer is altijd structureel geldig (anders gooit de
 * bouwer de DocumentFout van `voegToe`).
 */

type DifferentieelOpties = { polen?: Polen; als?: string };
type RuimteOpties = { ruimte?: Ruimte };

/** Gedeelde toestand van één bouwsessie. */
class Context {
  doc: InstallatieDocument;
  readonly ids: Record<string, NodeId> = {};

  constructor(stroomtype: Stroomtype | undefined) {
    this.doc = nieuwDocument(stroomtype ? { stroomtype } : {});
  }

  voeg(parentId: NodeId, invoer: NodeInvoer): NodeId {
    const resultaat = voegToe(this.doc, parentId, invoer);
    this.doc = resultaat.doc;
    return resultaat.id;
  }

  noem(naam: string, id: NodeId): void {
    if (Object.hasOwn(this.ids, naam)) {
      throw new Error(`Naam "${naam}" is al in gebruik in deze installatie`);
    }
    this.ids[naam] = id;
  }

  voegDifferentieelToe(parentId: NodeId, mA: number, opties: DifferentieelOpties | undefined): NodeId {
    const id = this.voeg(parentId, {
      type: "differentieel",
      gevoeligheid_mA: mA,
      nominaal_A: 40,
      polen: opties?.polen ?? 2,
      klasse: "A",
    });
    if (opties?.als !== undefined) this.noem(opties.als, id);
    return id;
  }

  voegBordToe(parentId: NodeId, naam: string | undefined): NodeId {
    return this.voeg(parentId, naam === undefined ? { type: "verdeelbord" } : { type: "verdeelbord", naam });
  }
}

const metRuimte = (ruimte: Ruimte | undefined): { ruimte?: Ruimte } => (ruimte ? { ruimte } : {});

export class KringBouwer {
  /** Laatste beveiliging van de kring. */
  private beveiligingId: NodeId | undefined;
  /** Laatste leiding van de kring. */
  private leidingId: NodeId | undefined;
  /** Laatste punt na de laatste leiding. */
  private puntId: NodeId | undefined;
  /** Laatst aangemaakte node, voor `als`. */
  private laatsteId: NodeId | undefined;

  constructor(
    private readonly ctx: Context,
    /** Bord, of differentieel in het bord, waaronder de kring hangt. */
    private readonly ouderId: NodeId,
  ) {}

  automaat(A: number, opties: { polen?: Polen; curve?: "B" | "C" | "D" } = {}): this {
    return this.beveilig({
      type: "automaat",
      nominaal_A: A,
      polen: opties.polen ?? 2,
      curve: opties.curve ?? "B",
    });
  }

  zekering(A: number): this {
    return this.beveilig({ type: "zekering", nominaal_A: A });
  }

  leiding(mm2: number, opties: { kabeltype?: string; aantalGeleiders?: number } = {}): this {
    const id = this.ctx.voeg(this.beveiligingId ?? this.ouderId, {
      type: "leiding",
      kabeltype: opties.kabeltype ?? "XVB",
      doorsnede_mm2: mm2,
      aantalGeleiders: opties.aantalGeleiders ?? 3,
    });
    this.leidingId = id;
    this.puntId = undefined;
    this.laatsteId = id;
    return this;
  }

  contactdozen(n: number, opties: RuimteOpties = {}): this {
    for (let i = 0; i < n; i++) {
      this.punt({
        type: "contactdoos",
        aantal: 1,
        randaarde: true,
        kinderbeveiliging: true,
        waterdicht: false,
        ...metRuimte(opties.ruimte),
      });
    }
    return this;
  }

  lichtpunten(n: number, opties: RuimteOpties = {}): this {
    for (let i = 0; i < n; i++) {
      this.punt({ type: "lichtpunt", aantal: 1, ...metRuimte(opties.ruimte) });
    }
    return this;
  }

  schakelaar(
    opties: { soort?: "enkel" | "dubbel" | "wissel" | "kruis" | "dimmer" | "drukknop"; ruimte?: Ruimte } = {},
  ): this {
    return this.punt({
      type: "schakelaar",
      soort: opties.soort ?? "enkel",
      waterdicht: false,
      ...metRuimte(opties.ruimte),
    });
  }

  toestel(soort: Toestelsoort, opties: { ruimte?: Ruimte; vermogen_W?: number } = {}): this {
    return this.punt({
      type: "toestel",
      soort,
      ...(opties.vermogen_W !== undefined ? { vermogen_W: opties.vermogen_W } : {}),
      ...metRuimte(opties.ruimte),
    });
  }

  onderbord(inhoud: (b: BordBouwer) => void, naam?: string): this {
    const bordId = this.ctx.voegBordToe(this.leidingId ?? this.beveiligingId ?? this.ouderId, naam);
    this.laatsteId = bordId;
    inhoud(new BordBouwer(this.ctx, bordId, bordId));
    return this;
  }

  /** Geeft de laatst aangemaakte node van deze kring een naam in `ids`. */
  als(naam: string): this {
    if (this.laatsteId === undefined) {
      throw new Error(`als("${naam}"): er is nog geen node aangemaakt in deze kring`);
    }
    this.ctx.noem(naam, this.laatsteId);
    return this;
  }

  private beveilig(invoer: NodeInvoer): this {
    const id = this.ctx.voeg(this.ouderId, invoer);
    this.beveiligingId = id;
    this.leidingId = undefined;
    this.puntId = undefined;
    this.laatsteId = id;
    return this;
  }

  private punt(invoer: NodeInvoer): this {
    const id = this.ctx.voeg(this.puntId ?? this.leidingId ?? this.beveiligingId ?? this.ouderId, invoer);
    this.puntId = id;
    this.laatsteId = id;
    return this;
  }
}

export class BordBouwer {
  constructor(
    private readonly ctx: Context,
    private readonly bordId: NodeId,
    /** Bord, of differentieel in het bord, waaronder kringen hangen. */
    private readonly ouderId: NodeId,
  ) {}

  kring(inhoud: (k: KringBouwer) => void): this {
    inhoud(new KringBouwer(this.ctx, this.ouderId));
    return this;
  }

  /** Differentieel binnen het bord dat de kringen in `inhoud` voedt. */
  differentieel(mA: number, inhoud: (b: BordBouwer) => void, opties?: DifferentieelOpties): this {
    const id = this.ctx.voegDifferentieelToe(this.ouderId, mA, opties);
    inhoud(new BordBouwer(this.ctx, this.bordId, id));
    return this;
  }

  /** Geeft het bord zelf een naam in `ids`. */
  als(naam: string): this {
    this.ctx.noem(naam, this.bordId);
    return this;
  }
}

export class VoedingBouwer {
  constructor(
    protected readonly ctx: Context,
    /** Teller, of differentieel, waaronder alles hangt. */
    protected readonly ouderId: NodeId,
  ) {}

  differentieel(mA: number, inhoud: (d: VoedingBouwer) => void, opties?: DifferentieelOpties): this {
    const id = this.ctx.voegDifferentieelToe(this.ouderId, mA, opties);
    inhoud(new VoedingBouwer(this.ctx, id));
    return this;
  }

  verdeelbord(inhoud: (b: BordBouwer) => void, naam?: string): this {
    const bordId = this.ctx.voegBordToe(this.ouderId, naam);
    inhoud(new BordBouwer(this.ctx, bordId, bordId));
    return this;
  }
}

export class InstallatieBouwer extends VoedingBouwer {
  constructor(stroomtype: Stroomtype | undefined) {
    const ctx = new Context(stroomtype);
    const teller = ctx.doc.nodes[ctx.doc.rootId]!.kinderen[0]!;
    super(ctx, teller);
  }

  bouw(): { doc: InstallatieDocument; ids: Record<string, NodeId> } {
    return { doc: this.ctx.doc, ids: { ...this.ctx.ids } };
  }
}

export function installatie(opties: { stroomtype?: Stroomtype } = {}): InstallatieBouwer {
  return new InstallatieBouwer(opties.stroomtype);
}
