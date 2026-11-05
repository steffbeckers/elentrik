CREATE TABLE "admin_notities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisatie_id" text NOT NULL,
	"project_id" uuid,
	"tekst" text NOT NULL,
	"opvolgdatum" text,
	"auteur_id" text NOT NULL,
	"auteur_naam" text NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL,
	"gewijzigd" timestamp with time zone DEFAULT now() NOT NULL,
	"gearchiveerd" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "admin_notities_organisatie_idx" ON "admin_notities" USING btree ("organisatie_id","aangemaakt","id");--> statement-breakpoint
CREATE INDEX "admin_notities_project_idx" ON "admin_notities" USING btree ("project_id","aangemaakt","id");--> statement-breakpoint
CREATE INDEX "admin_notities_opvolging_idx" ON "admin_notities" USING btree ("gearchiveerd","opvolgdatum");