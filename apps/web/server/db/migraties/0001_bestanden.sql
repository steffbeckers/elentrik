CREATE TABLE "bestanden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"soort" text NOT NULL,
	"mime" text NOT NULL,
	"grootte" integer NOT NULL,
	"sleutel" text NOT NULL,
	"aangemaakt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bestanden" ADD CONSTRAINT "bestanden_project_id_projecten_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projecten"("id") ON DELETE no action ON UPDATE no action;