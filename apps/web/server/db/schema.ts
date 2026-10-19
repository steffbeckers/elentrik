import type { Partij } from "@elentrik/model";
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
