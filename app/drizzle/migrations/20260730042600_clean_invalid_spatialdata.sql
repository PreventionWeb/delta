UPDATE hazardous_event
SET spatial_footprint = NULL
WHERE jsonb_typeof(spatial_footprint) = 'string';

UPDATE disaster_event
SET spatial_footprint = NULL
WHERE jsonb_typeof(spatial_footprint) = 'string';

UPDATE disaster_records
SET spatial_footprint = NULL
WHERE jsonb_typeof(spatial_footprint) = 'string';
