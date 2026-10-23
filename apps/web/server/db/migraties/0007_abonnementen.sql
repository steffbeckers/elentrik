CREATE TABLE "abonnementen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisatie_id" text NOT NULL,
	"stripe_klant_id" text NOT NULL,
	"stripe_abonnement_id" text,
	"status" text,
	"formule" text,
	"periode_einde" timestamp with time zone,
	"opgezegd_op_periode_einde" boolean DEFAULT false NOT NULL,
	"achterstallig_sinds" timestamp with time zone,
	"open_checkout_sessie" text,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL,
	"bijgewerkt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abonnementen_organisatie_id_unique" UNIQUE("organisatie_id"),
	CONSTRAINT "abonnementen_stripe_klant_id_unique" UNIQUE("stripe_klant_id"),
	CONSTRAINT "abonnementen_stripe_abonnement_id_unique" UNIQUE("stripe_abonnement_id")
);
--> statement-breakpoint
CREATE TABLE "doorgestuurde_facturen" (
	"stripe_factuur_id" text PRIMARY KEY NOT NULL,
	"nummer" text,
	"verstuurd" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"verwerkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "proef_einde" timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days');--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "vrijgesteld" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "proef_gebruikt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Bestaande organisaties krijgen 30 dagen vanaf dit moment (de default hierboven wordt eenmalig
-- ingevuld). Wie vandaag al eigenaar is, heeft zijn proefperiode gehad.
UPDATE "user" SET "proef_gebruikt" = true WHERE "id" IN (SELECT "user_id" FROM "member" WHERE "role" = 'owner');--> statement-breakpoint
ALTER TABLE "abonnementen" ADD CONSTRAINT "abonnementen_organisatie_id_organization_id_fk" FOREIGN KEY ("organisatie_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;