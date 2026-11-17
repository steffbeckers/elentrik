CREATE TABLE "instance" (
	"sleutel" text PRIMARY KEY DEFAULT 'deze' NOT NULL,
	"id" uuid NOT NULL,
	"aangemaakt_op" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_een_rij" CHECK ("instance"."sleutel" = 'deze')
);
--> statement-breakpoint
CREATE TABLE "instance_meldingen" (
	"instance_id" uuid PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"versie" text NOT NULL,
	"abonnementen_aan" boolean NOT NULL,
	"aantal_organisaties" integer NOT NULL,
	"aantal_gebruikers" integer NOT NULL,
	"eerste_melding_op" timestamp with time zone NOT NULL,
	"laatste_melding_op" timestamp with time zone NOT NULL,
	"aantal_meldingen" integer DEFAULT 1 NOT NULL,
	"laatste_ip" text
);
--> statement-breakpoint
CREATE INDEX "instance_meldingen_eerste_idx" ON "instance_meldingen" USING btree ("eerste_melding_op");--> statement-breakpoint
CREATE INDEX "instance_meldingen_laatste_idx" ON "instance_meldingen" USING btree ("laatste_melding_op");