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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projecten.id),
  soort: text("soort", { enum: ["plan-origineel", "plan-raster"] }).notNull(),
  mime: text("mime").notNull(),
  grootte: integer("grootte").notNull(),
  sleutel: text("sleutel").notNull(),
  aangemaakt: timestamp("aangemaakt", { withTimezone: true }).notNull().defaultNow(),
});
