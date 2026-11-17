CREATE TABLE "projectaankopen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisatie_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"checkout_sessie" text NOT NULL,
	"status" text NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL,
	"betaald_op" timestamp with time zone,
	CONSTRAINT "projectaankopen_checkout_sessie_unique" UNIQUE("checkout_sessie")
);
--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "proef_einde" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "onderwijs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projecten" ADD COLUMN "gekocht_op" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projecten" ADD COLUMN "abonnement_stempel_op" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projectaankopen" ADD CONSTRAINT "projectaankopen_organisatie_id_organization_id_fk" FOREIGN KEY ("organisatie_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projectaankopen" ADD CONSTRAINT "projectaankopen_project_id_projecten_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projecten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projectaankopen_open_uniek" ON "projectaankopen" USING btree ("project_id") WHERE "projectaankopen"."status" = 'open';--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_vrijgesteld_of_onderwijs" CHECK (NOT ("organization"."vrijgesteld" AND "organization"."onderwijs"));
--> statement-breakpoint
UPDATE projecten SET abonnement_stempel_op = now() WHERE verwijderd IS NULL AND organisatie_id IS NOT NULL;
