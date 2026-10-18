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
