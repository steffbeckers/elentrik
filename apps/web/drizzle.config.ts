import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Dezelfde .env als de Nuxt-app (zie .env.example).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migraties",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
