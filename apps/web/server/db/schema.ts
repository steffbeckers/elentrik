import type { Partij } from "@elentrik/model";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projecten = pgTable(
  "projecten",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: projecten van vóór het inloggen hebben nog geen organisatie, tot de overname
    // (spec 5b.3). Nieuwe projecten krijgen altijd de actieve organisatie.
    organisatieId: text("organisatie_id").references(() => organization.id),
    naam: text("naam").notNull(),
    klantnaam: text("klantnaam").notNull().default(""),
    document: jsonb("document").notNull(),
    versie: integer("versie").notNull().default(1),
    aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
    gewijzigd: timestamp("gewijzigd", { withTimezone: true }).notNull().defaultNow(),
    verwijderd: timestamp("verwijderd", { withTimezone: true }),
  },
  (table) => [index("projecten_organisatie_id_idx").on(table.organisatieId)],
);

export const bestanden = pgTable(
  "bestanden",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null voor een bestand dat bij geen project hoort, zoals het logo van de installateur.
    projectId: uuid("project_id").references(() => projecten.id),
    // Alleen voor een logo: de organisatie waartoe het hoort. Plan- en exportbestanden horen via
    // hun project bij een organisatie en laten dit leeg.
    organisatieId: text("organisatie_id").references(() => organization.id),
    soort: text("soort", { enum: ["plan-origineel", "plan-raster", "logo", "export"] }).notNull(),
    mime: text("mime").notNull(),
    grootte: integer("grootte").notNull(),
    sleutel: text("sleutel").notNull(),
    aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bestanden_project_id_idx").on(table.projectId)],
);

/**
 * De gegevens van de installateur per organisatie, voor de cartouche van elke export.
 *
 * Sleutel: `organisatie_id` (uniek, nullable). `id` blijft de technische primaire sleutel, nu
 * met een identity die bij 2 begint, zodat de bestaande rij `id = 1` ongemoeid blijft. Die rij
 * heeft `organisatie_id` null (legacy) tot de overname haar aan de eerste organisatie koppelt.
 * Nieuwe organisaties krijgen een eigen rij met een gegenereerd `id`.
 */
export const bedrijfsinstellingen = pgTable(
  "bedrijfsinstellingen",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity({ startWith: 2 }),
    organisatieId: text("organisatie_id").references(() => organization.id),
    installateur: jsonb("installateur").$type<Partij>().notNull().default({ naam: "" }),
    gewijzigd: timestamp("gewijzigd", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("bedrijfsinstellingen_organisatie_id_uidx").on(table.organisatieId)],
);

/** Een onveranderlijke kopie van het opgeslagen document op het moment van een export. */
export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projecten.id),
  versie: integer("versie").notNull(),
  document: jsonb("document").notNull(),
  reden: text("reden", { enum: ["export"] }).notNull(),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
});

export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projecten.id),
  snapshotId: uuid("snapshot_id")
    .notNull()
    .references(() => snapshots.id),
  bestandId: uuid("bestand_id")
    .notNull()
    .references(() => bestanden.id),
  versieLabel: text("versie_label").notNull(),
  papier: text("papier", { enum: ["A4", "A3"] }).notNull(),
  onderdelen: jsonb("onderdelen").notNull(),
  aantalFouten: integer("aantal_fouten").notNull(),
  aantalWaarschuwingen: integer("aantal_waarschuwingen").notNull(),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
});

// --- Better Auth -------------------------------------------------------------------------------
// Tabellen van Better Auth (kern, organization- en magic-link-plugin), met de standaardnamen van
// Better Auth: tabelnamen in het enkelvoud, kolommen in snake_case, ids als tekst. De vorm volgt
// de Drizzle-schemagenerator van Better Auth 1.7.7 voor de configuratie in server/auth/index.ts.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** Bedrijfsnaam uit de registratie, tot de eerste bevestigde aanmelding er een organisatie van maakt. */
  wachtendeBedrijfsnaam: text("wachtende_bedrijfsnaam"),
  /**
   * De laatst gekozen actieve organisatie (spec 2.4): een nieuwe sessie begint daar, zolang de
   * gebruiker er nog lid van is. Overleeft uitloggen, anders dan de sessie zelf.
   */
  laatsteOrganisatieId: text("laatste_organisatie_id"),
  /**
   * Waar zodra de gebruiker zijn eerste eigen bedrijf aanmaakte: alleen dat bedrijf krijgt een
   * proefperiode (spec 4.1). Alleen de server zet dit (`input: false` in Better Auth).
   */
  proefGebruikt: boolean("proef_gebruikt").default(false).notNull(),
  /**
   * De taal van de interface en van de mails aan deze gebruiker: `nl`, `fr` of `en`. Bij de
   * registratie uit de header `x-elentrik-taal`; daarna alleen via PUT /api/mij/taal (`input: false`
   * in Better Auth).
   */
  taal: text("taal").default("nl").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
    /**
     * Tot wanneer de organisatie gratis mag schrijven. De code zet het bij het aanmaken
     * (`kenProefperiodeToe`); de default is het vangnet voor een rechtstreekse insert, en geeft
     * bestaande organisaties bij de migratie 30 dagen vanaf dat moment.
     */
    proefEinde: timestamp("proef_einde", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    /** Altijd schrijfrecht zonder abonnement; alleen via SQL te zetten. */
    vrijgesteld: boolean("vrijgesteld").notNull().default(false),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

// --- Abonnementen (Stripe) ----------------------------------------------------------------------

/** Eén rij per organisatie die ooit naar Stripe Checkout ging (spec 4.1). */
export const abonnementen = pgTable("abonnementen", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisatieId: text("organisatie_id")
    .notNull()
    .unique()
    .references(() => organization.id),
  stripeKlantId: text("stripe_klant_id").notNull().unique(),
  /** Het abonnement dat Elentrik volgt (het levendigste van de klant). */
  stripeAbonnementId: text("stripe_abonnement_id").unique(),
  /** De Stripe-status zoals ze is. */
  status: text("status"),
  formule: text("formule", { enum: ["maand", "jaar"] }),
  periodeEinde: timestamp("periode_einde", { withTimezone: true }),
  opgezegdOpPeriodeEinde: boolean("opgezegd_op_periode_einde").notNull().default(false),
  /** Het moment waarop voor het eerst `past_due` werd gezien; gewist bij een andere status. */
  achterstalligSinds: timestamp("achterstallig_sinds", { withTimezone: true }),
  /** De laatst geopende Checkout-sessie, om ze te kunnen laten vervallen. */
  openCheckoutSessie: text("open_checkout_sessie"),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
  bijgewerkt: timestamp("bijgewerkt", { withTimezone: true }).notNull().defaultNow(),
});

/** De id's van volledig verwerkte Stripe-events. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  verwerkt: timestamp("verwerkt", { withTimezone: true }).notNull().defaultNow(),
});

/** Welke Stripe-facturen al naar de boekhouding gingen, zodat elke maar één keer vertrekt. */
export const doorgestuurdeFacturen = pgTable("doorgestuurde_facturen", {
  stripeFactuurId: text("stripe_factuur_id").primaryKey(),
  nummer: text("nummer"),
  verstuurd: timestamp("verstuurd", { withTimezone: true }).notNull().defaultNow(),
});
