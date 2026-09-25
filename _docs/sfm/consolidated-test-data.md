# SFM Consolidated Test Data (Quick Guide)

Use this checklist to seed DELTA data so `/api/consolidated` returns values for different indicators.

## 1) Common setup (required for all indicators)

1. Create/use an API key for the target country account.
2. Use that same country ISO3 in the query param `country` (lowercase).
3. Create a **Disaster Event** and at least one **Disaster Record** in that tenant.
4. Set Disaster Record `startDate` in the target year (for example `2018-06-10` for `year=2018`).
5. Ensure Disaster Record approval status is `published`.
6. Link Disaster Record to:
   - a hazard (`hipHazardId` directly or via disaster event),
   - a level-1 division (`disaster_records_division` -> `division.level = 1`).

Without steps 4-6, `hazards` and `subdivision1` may stay empty.

## 2) Indicator-specific data to add

## Count indicators (`value: { total }`)

- `a2a` (deaths)
  - Add `human_category_presence.deaths = true` and `deaths_total`.
  - Add `human_dsg` + `deaths` rows for sex/age/disability/income splits if you want `otherdisaggregation` populated.

- `a3a` (missing)
  - Add `human_category_presence.missing = true` and `missing_total`.
  - Add `human_dsg` + `missing` rows for disaggregation output.

- `b2` (injured)
  - Add `human_category_presence.injured = true` and `injured_total`.
  - Add `human_dsg` + `injured` rows for disaggregation output.

- `b3`, `b3a` (damaged dwellings)
  - Add `damages` rows in sectors whose name contains `housing` or `dwell`.
  - Populate `pdDamageAmount`.

- `b4`, `b4a` (destroyed dwellings)
  - Add `damages` rows in sectors whose name contains `housing` or `dwell`.
  - Populate `tdDamageAmount`.

- `b5` (livelihoods)
  - Add `losses` rows where:
    - `relatedToAgriculture = number_of_persons_whose_livelihoods_related_to_sector_lost`
      OR
    - `relatedToNotAgriculture = number_of_persons_whose_livelihoods_related_to_sector_lost`
  - Set `publicUnits` and/or `privateUnits`.

## Loss-style indicators (`value: { total, destroyed, damaged, economic }`)

- `c4` (housing)
  - Add `damages` rows in sectors containing `housing` or `dwell`.
  - Fields used:
    - `total` -> `totalDamageAmount`
    - `destroyed` -> `tdDamageAmount`
    - `damaged` -> `pdDamageAmount`
    - `economic` -> `totalRepairReplacement`

- `c5a` (health), `c5b` (education), `c5c` (other infrastructure)
  - Add `damages` rows in sectors matched by name:
    - `c5a`: `health`, `hospital`, `medical`
    - `c5b`: `education`, `school`
    - `c5c`: `infrastructure`, `transport`, `water`, `energy`, `communication`
  - Same four fields as `c4`.

## Service disruption indicators (`value: { total }`)

- `d6`, `d7`, `d8`
  - Add `disruption` rows with `peopleAffected`.
  - Sector name matching:
    - `d6`: `education`
    - `d7`: `health`, `hospital`
    - `d8`: `transport`, `energy`, `communication`, `water`, `sewer`, `solid waste`, `administration`, `emergency`

## 3) Quick test calls

```bash
TOKEN="<api_key_secret>"

curl "http://localhost:3000/api/consolidated?country=<iso3>&year=2018&indicator=a2a" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/consolidated?country=<iso3>&year=2018&indicator=c4" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/consolidated?country=<iso3>&year=2018&indicator=d8" \
  -H "Authorization: Bearer $TOKEN"
```

## 4) If result is empty or null

- Check country/token tenant match first.
- Check `startDate` year and `published` status.
- Check sector naming for `b3+`, `c*`, `d*` indicators.
- For debug reason headers in non-production, add `&debug=1`.

## 5) Legacy format baseline (DesInventar API)

From live checks against `https://desinventar-api.undrr.org/api/consolidated` (country `pan`, year `2018`), expected output format by indicator is:

- Common top-level keys for all indicators:
  - `ctycode`, `year`, `indicator`, `value`, `source`, `hazards`, `subdivision1`, `otherdisaggregation`

- Count-metric format (`total` only):
  - `a2a`, `a3a`, `b2`, `b3a`, `b4a`, `d6`, `d8`
  - `value`: `{ "total": <number|null> }`
  - `hazards` values: `{ "total": ... }`
  - `subdivision1` values: `{ "total": ... }`

- Loss-metric format (`total/destroyed/damaged/economic`):
  - `c2c`, `c2l`, `c2fo`, `c2a`, `c2fi`, `c2lb`, `c2la`, `c3`, `c4`, `c5a`, `c5b`, `c5c`
  - `value`: `{ "total": ..., "destroyed": ..., "damaged": ..., "economic": ... }`
  - `hazards` values: same 4-key object
  - `subdivision1` values: same 4-key object

- Empty-object metric in legacy responses for some indicators/countries/years:
  - `b3`, `b4`, `b5`, `c6`, `d7` can appear as `{}` in `value`, and similarly empty item objects in `hazards`/`subdivision1`.

- `otherdisaggregation` categories vary by indicator:
  - `a2a/a3a/b2/b3/b3a/b4/b4a/b5`: `Age`, `Disability`, `Income`, `Sex`
  - `c2c`: `Crops`
  - `c2l`: `Livestocks`
  - `c3`: `Productive Assets`
  - `c5c`: `Infraestructure`
  - `c2fo/c2a/c2fi/c2lb/c2la/c4/c5a/c5b/c6/d6/d7/d8`: often empty `{}`

## 6) DELTA format readiness matrix (current)

Status legend:
- `PASS`: top-level keys + metric object shape match legacy pattern
- `PARTIAL`: endpoint works, but format/details differ in some fields
- `NOT YET`: indicator not implemented in DELTA consolidated endpoint

Format parity only (not value parity):

- `a2a`: `PASS`
- `a3a`: `PASS`
- `b2`: `PASS`
- `b3`: `PARTIAL` (legacy may return `{}` metric; DELTA returns count metric)
- `b3a`: `PARTIAL` (DELTA currently returns empty `otherdisaggregation` categories)
- `b4`: `PARTIAL` (legacy may return `{}` metric; DELTA returns count metric)
- `b4a`: `PARTIAL` (DELTA currently returns empty `otherdisaggregation` categories)
- `b5`: `PARTIAL` (legacy may return `{}` metric; DELTA returns count metric)
- `c2c`: `NOT YET`
- `c2l`: `NOT YET`
- `c2fo`: `NOT YET`
- `c2a`: `NOT YET`
- `c2fi`: `NOT YET`
- `c2lb`: `NOT YET`
- `c2la`: `NOT YET`
- `c3`: `NOT YET`
- `c4`: `PASS`
- `c5a`: `PASS`
- `c5b`: `PASS`
- `c5c`: `PARTIAL` (legacy often includes `Infraestructure` category; DELTA currently empty)
- `c6`: `NOT YET`
- `d6`: `PASS`
- `d7`: `PARTIAL` (legacy may return `{}` metric; DELTA returns count metric)
- `d8`: `PASS`

## TODO
- Change the authentication to environemnt variable TOKEN_FOR_SFM_INTEGRATION instead of using the in country API key
- Remove the API key validation check for the API call
- Think of which instance to use, thinking of using conditional rule
  - if official instance exists use this
  - add another instance type for data migrated from DesInventar
  - think of override for SFM token to use instance UUID but it must match with the country ISO

## DesInventar API 
```sh
TOKEN_DESINVENTAR_SFM="See .env file for details"

curl "https://desinventar-api.undrr.org/api/consolidated?country=pan&year=2018&indicator=a2a" \
-H "Authorization: Bearer $TOKEN_DESINVENTAR_SFM"
```
