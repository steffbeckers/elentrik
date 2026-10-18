CREATE TABLE "projecten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"naam" text NOT NULL,
	"klantnaam" text DEFAULT '' NOT NULL,
	"document" jsonb NOT NULL,
	"versie" integer DEFAULT 1 NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL,
	"gewijzigd" timestamp with time zone DEFAULT now() NOT NULL,
	"verwijderd" timestamp with time zone
);
