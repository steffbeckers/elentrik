-- Er blijft altijd minstens één eigenaar (owner) per organisatie, ook bij gelijktijdige verzoeken.
-- Vóór elke wijziging of verwijdering van een eigenaar vergrendelt de trigger de organisatierij,
-- zodat twee eigenaars die elkaar tegelijk degraderen of verwijderen na elkaar komen; de tweede
-- ziet dan geen andere eigenaar meer en faalt met de boodschap LAATSTE_EIGENAAR.
-- Verdwijnt de organisatie of de gebruiker zelf (een cascade), dan houdt de trigger niets tegen.
CREATE OR REPLACE FUNCTION "elentrik_is_eigenaar"(rol text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT ',' || replace(coalesce(rol, ''), ' ', '') || ',' LIKE '%,owner,%'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "elentrik_bewaak_laatste_eigenaar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bewaken boolean;
BEGIN
  bewaken := "elentrik_is_eigenaar"(OLD.role)
    AND NOT (
      TG_OP = 'UPDATE'
      AND NEW.organization_id = OLD.organization_id
      AND "elentrik_is_eigenaar"(NEW.role)
    );
  IF bewaken THEN
    PERFORM 1 FROM "organization" WHERE id = OLD.organization_id FOR UPDATE;
    IF FOUND
      AND EXISTS (SELECT 1 FROM "user" WHERE id = OLD.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM "member"
        WHERE organization_id = OLD.organization_id AND id <> OLD.id AND "elentrik_is_eigenaar"(role)
      )
    THEN
      RAISE EXCEPTION 'LAATSTE_EIGENAAR' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "member_laatste_eigenaar"
BEFORE UPDATE OR DELETE ON "member"
FOR EACH ROW EXECUTE FUNCTION "elentrik_bewaak_laatste_eigenaar"();
