CREATE TABLE "bedrijfsinstellingen" (
	"id" integer PRIMARY KEY NOT NULL,
	"installateur" jsonb DEFAULT '{"naam":""}'::jsonb NOT NULL,
	"gewijzigd" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"bestand_id" uuid NOT NULL,
	"versie_label" text NOT NULL,
	"papier" text NOT NULL,
	"onderdelen" jsonb NOT NULL,
	"aantal_fouten" integer NOT NULL,
	"aantal_waarschuwingen" integer NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"versie" integer NOT NULL,
	"document" jsonb NOT NULL,
	"reden" text NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bestanden" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projecten_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projecten"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_bestand_id_bestanden_id_fk" FOREIGN KEY ("bestand_id") REFERENCES "public"."bestanden"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_project_id_projecten_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projecten"("id") ON DELETE no action ON UPDATE no action;