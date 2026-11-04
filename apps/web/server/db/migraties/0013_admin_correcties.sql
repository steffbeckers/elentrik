CREATE TABLE "admin_correcties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisatie_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"sessie_id" text NOT NULL,
	"reden" text NOT NULL,
	"gestart" timestamp with time zone DEFAULT now() NOT NULL,
	"verloopt" timestamp with time zone NOT NULL,
	"beeindigd" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_revisies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organisatie_id" text NOT NULL,
	"correctie_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"voor" jsonb NOT NULL,
	"na" jsonb NOT NULL,
	"tijd" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_correcties_project_idx" ON "admin_correcties" USING btree ("project_id","gestart");--> statement-breakpoint
CREATE INDEX "admin_revisies_project_idx" ON "admin_revisies" USING btree ("project_id","tijd");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_revisies_audit_idx" ON "admin_revisies" USING btree ("audit_id");