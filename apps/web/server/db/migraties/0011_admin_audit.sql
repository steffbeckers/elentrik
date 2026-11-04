CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_naam" text NOT NULL,
	"doel_type" text NOT NULL,
	"doel_id" text NOT NULL,
	"organisatie_id" text,
	"project_id" uuid,
	"actie" text NOT NULL,
	"reden" text NOT NULL,
	"voor" jsonb,
	"na" jsonb,
	"correctie_id" uuid,
	"tijd" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_mutaties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"mutatie_id" uuid NOT NULL,
	"actie" text NOT NULL,
	"doel_id" text NOT NULL,
	"vingerafdruk" text NOT NULL,
	"antwoord" jsonb NOT NULL,
	"tijd" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_tijd_idx" ON "admin_audit" USING btree ("tijd","id");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_idx" ON "admin_audit" USING btree ("actor_id","tijd","id");--> statement-breakpoint
CREATE INDEX "admin_audit_doel_idx" ON "admin_audit" USING btree ("doel_id","tijd","id");--> statement-breakpoint
CREATE INDEX "admin_audit_organisatie_idx" ON "admin_audit" USING btree ("organisatie_id","tijd","id");--> statement-breakpoint
CREATE INDEX "admin_audit_project_idx" ON "admin_audit" USING btree ("project_id","tijd","id");--> statement-breakpoint
CREATE INDEX "admin_audit_correctie_idx" ON "admin_audit" USING btree ("correctie_id","tijd","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mutaties_actor_mutatie_idx" ON "admin_mutaties" USING btree ("actor_id","mutatie_id");