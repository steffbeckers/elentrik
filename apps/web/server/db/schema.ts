import type { Partij } from "@elentrik/model";
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

export const projecten = pgTable("projecten", {
  id: uuid("id").primaryKey().defaultRandom(),
  naam: text("naam").notNull(),
  klantnaam: text("klantnaam").notNull().default(""),
  document: jsonb("document").notNull(),
  versie: integer("versie").notNull().default(1),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
  gewijzigd: timestamp("gewijzigd", { withTimezone: true }).notNull().defaultNow(),
  verwijderd: timestamp("verwijderd", { withTimezone: true }),
});

export const bestanden = pgTable("bestanden", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Null voor een bestand dat bij geen project hoort, zoals het logo van de installateur.
  projectId: uuid("project_id").references(() => projecten.id),
  soort: text("soort", { enum: ["plan-origineel", "plan-raster", "logo", "export"] }).notNull(),
  mime: text("mime").notNull(),
  grootte: integer("grootte").notNull(),
  sleutel: text("sleutel").notNull(),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
});

/** Eén rij met `id = 1`: de gegevens van de installateur, voor de cartouche van elke export. */
export const bedrijfsinstellingen = pgTable("bedrijfsinstellingen", {
  id: integer("id").primaryKey(),
  installateur: jsonb("installateur").$type<Partij>().notNull().default({ naam: "" }),
  gewijzigd: timestamp("gewijzigd", { withTimezone: true }).notNull().defaultNow(),
});

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
