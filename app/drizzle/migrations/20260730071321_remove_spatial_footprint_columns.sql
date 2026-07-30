ALTER TABLE disaster_event
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE hazardous_event
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE disaster_records
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE damages
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE disruption
DROP COLUMN IF EXISTS spatial_footprint;

ALTER TABLE losses
DROP COLUMN IF EXISTS spatial_footprint;