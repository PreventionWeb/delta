ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_id" uuid
  CONSTRAINT "hazardous_event_specific_hazard_id_specific_hazard_id_fk"
  REFERENCES "specific_hazard"("id");
