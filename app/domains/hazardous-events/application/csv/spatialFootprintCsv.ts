// Legacy `spatialFootprint` cell <-> CA observation content (design.md D2, D6, D8). Pure.

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ST_AsGeoJSON's default `maxdecimaldigits` (OD-8). */
const POSTGIS_DECIMALS = 9;
/** Magnitudes at most the first, or at least the second, print unrounded (OD-8). */
const POSTGIS_UNROUNDED_UP_TO = 1e-8;
const POSTGIS_UNROUNDED_FROM = 1e15;
/** PostGIS keeps X, Y and Z only. */
const POSTGIS_ORDINATES = 3;

/** GeometryCollections nested deeper than this are rejected; RFC 7946 §3.1.8 discourages nesting. */
const MAX_COLLECTION_DEPTH = 8;

const MAP_COORDINATES = "Map coordinates";
const GEOGRAPHIC_LEVEL = "Geographic level";

export interface CsvSpatialFootprint {
	geometries: unknown[];
	divisionIds: string[];
}

/** `syntax` separates unparseable JSON (always phase 1) from content errors (D10). */
export type SpatialFootprintParse =
	| { ok: true; footprint: CsvSpatialFootprint }
	| { ok: false; syntax: boolean };

type Geometry =
	| { type: string; coordinates: unknown }
	| { type: "GeometryCollection"; geometries: Geometry[] };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- RFC 7946 structure (§3.1) ---

function isPosition(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		value.every((n) => typeof n === "number" && Number.isFinite(n))
	);
}

function isArrayOf(value: unknown, check: (v: unknown) => boolean): boolean {
	return Array.isArray(value) && value.every(check);
}

function isLineString(value: unknown): boolean {
	return isArrayOf(value, isPosition) && (value as unknown[]).length >= 2;
}

function samePosition(a: readonly unknown[], b: readonly unknown[]): boolean {
	return a.length === b.length && a.every((n, i) => n === b[i]);
}

function isLinearRing(value: unknown): boolean {
	if (!isArrayOf(value, isPosition)) return false;
	const ring = value as unknown[][];
	return ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1]);
}

function isPolygon(value: unknown): boolean {
	return isArrayOf(value, isLinearRing);
}

// A Map, so inherited names such as `valueOf` are not geometry types.
const COORDINATE_CHECKS: ReadonlyMap<string, (v: unknown) => boolean> = new Map<
	string,
	(v: unknown) => boolean
>([
	["Point", isPosition],
	["MultiPoint", (v) => isArrayOf(v, isPosition)],
	["LineString", isLineString],
	["MultiLineString", (v) => isArrayOf(v, isLineString)],
	["Polygon", isPolygon],
	["MultiPolygon", (v) => isArrayOf(v, isPolygon)],
]);

/** Only the members PostGIS keeps, so what is stored is what is compared (OD-8). */
function toGeometry(value: unknown, depth = 0): Geometry | null {
	if (!isObject(value) || typeof value.type !== "string") return null;
	if (value.type === "GeometryCollection") {
		if (!Array.isArray(value.geometries) || depth >= MAX_COLLECTION_DEPTH) {
			return null;
		}
		const geometries = value.geometries.map((g) => toGeometry(g, depth + 1));
		return geometries.every((g) => g !== null)
			? { type: "GeometryCollection", geometries: geometries as Geometry[] }
			: null;
	}
	const check = COORDINATE_CHECKS.get(value.type);
	return check !== undefined && check(value.coordinates)
		? { type: value.type, coordinates: value.coordinates }
		: null;
}

// --- Items (D2) ---

function featureGeometry(feature: unknown): Geometry | null {
	return isObject(feature) ? toGeometry(feature.geometry) : null;
}

function itemGeometries(geojson: unknown): Geometry[] | null {
	if (!isObject(geojson)) return null;
	if (geojson.type === "Feature") {
		const geometry = featureGeometry(geojson);
		return geometry === null ? null : [geometry];
	}
	if (geojson.type === "FeatureCollection") {
		const { features } = geojson;
		if (!Array.isArray(features) || features.length === 0) return null;
		const geometries = features.map(featureGeometry);
		return geometries.every((g) => g !== null)
			? (geometries as Geometry[])
			: null;
	}
	const geometry = toGeometry(geojson);
	return geometry === null ? null : [geometry];
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

/** The legacy loader writes both places; a malformed id is kept so it can be echoed (D4). */
function itemDivisionId(item: Record<string, unknown>): string | null {
	const properties = isObject(item.geojson) ? item.geojson.properties : null;
	const id =
		(isObject(properties) ? nonEmptyString(properties.division_id) : null) ??
		nonEmptyString(item.division_id);
	if (id === null) return null;
	return UUID_RE.test(id) ? id.toLowerCase() : id;
}

function parseItems(items: unknown): CsvSpatialFootprint | null {
	if (!Array.isArray(items)) return null;
	const geometries: unknown[] = [];
	const divisionIds = new Set<string>();
	for (const item of items) {
		if (!isObject(item)) return null;
		if (item.map_option === MAP_COORDINATES) {
			const found = itemGeometries(item.geojson);
			if (found === null) return null;
			// A loop, not a spread: spreading very large arrays overflows the call stack.
			for (const geometry of found) geometries.push(geometry);
		} else if (item.map_option === GEOGRAPHIC_LEVEL) {
			const id = itemDivisionId(item);
			if (id === null) return null;
			divisionIds.add(id);
		} else {
			return null;
		}
	}
	// The entity rejects duplicate division ids; legacy collapsed them too.
	return { geometries, divisionIds: [...divisionIds] };
}

export function parseSpatialFootprintCell(raw: string): SpatialFootprintParse {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return { ok: false, syntax: true };
	}
	let footprint: CsvSpatialFootprint | null;
	try {
		footprint = parseItems(json);
	} catch {
		// Hostile input must be a row error, never a 500.
		footprint = null;
	}
	return footprint === null
		? { ok: false, syntax: false }
		: { ok: true, footprint };
}

// --- Canonical form (D6, OD-8) ---

/** Rounds the shortest decimal text half-even, as PostGIS does; `toFixed` rounds the binary
 * value instead and disagrees on ties (pinned in DrizzleHazardousEventRepository.test.ts). */
function roundShortestHalfEven(n: number): number {
	const [mantissa, exponent = "0"] = String(Math.abs(n)).split("e");
	const [whole, fraction = ""] = mantissa.split(".");
	// Shift the point by the exponent so the digits read as a plain decimal.
	const shift = Number(exponent);
	const digits = whole + fraction;
	const point = whole.length + shift;
	const padded =
		point <= 0 ? "0".repeat(1 - point) + digits : digits.padEnd(point, "0");
	const pointAt = Math.max(point, 1);
	const decimals = padded.slice(pointAt);
	if (decimals.length <= POSTGIS_DECIMALS) return n + 0;
	const kept = BigInt(padded.slice(0, pointAt + POSTGIS_DECIMALS));
	const next = decimals[POSTGIS_DECIMALS];
	const rest = decimals.slice(POSTGIS_DECIMALS + 1);
	const roundUp =
		next > "5" || (next === "5" && (/[1-9]/.test(rest) || kept % 2n === 1n));
	const scaled = (roundUp ? kept + 1n : kept)
		.toString()
		.padStart(POSTGIS_DECIMALS + 1, "0");
	const text = `${scaled.slice(0, -POSTGIS_DECIMALS)}.${scaled.slice(-POSTGIS_DECIMALS)}`;
	return (n < 0 ? -Number(text) : Number(text)) + 0;
}

function roundOrdinate(n: number): number {
	const magnitude = Math.abs(n);
	if (
		magnitude <= POSTGIS_UNROUNDED_UP_TO ||
		magnitude >= POSTGIS_UNROUNDED_FROM
	) {
		return n + 0;
	}
	return roundShortestHalfEven(n);
}

function isNumberArray(value: unknown[]): value is number[] {
	return value.every((n) => typeof n === "number");
}

/** True when any position of the geometry, collection members included, has a Z ordinate. */
function hasZ(value: unknown): boolean {
	if (Array.isArray(value)) {
		return isNumberArray(value) ? value.length >= 3 : value.some(hasZ);
	}
	if (!isObject(value)) return false;
	return Array.isArray(value.geometries)
		? value.geometries.some(hasZ)
		: hasZ(value.coordinates);
}

/** PostGIS gives every position a Z of 0 once any position of the geometry has one. */
function canonicalCoordinates(value: unknown, padZ: boolean): unknown {
	if (!Array.isArray(value)) return value;
	if (!isNumberArray(value)) {
		return value.map((v) => canonicalCoordinates(v, padZ));
	}
	const position = value.slice(0, POSTGIS_ORDINATES).map(roundOrdinate);
	return padZ && position.length === 2 ? [...position, 0] : position;
}

function canonicalGeometry(value: unknown, padZ: boolean): unknown {
	if (!isObject(value)) return value;
	if (value.type === "GeometryCollection" && Array.isArray(value.geometries)) {
		return {
			type: value.type,
			geometries: value.geometries.map((g) => canonicalGeometry(g, padZ)),
		};
	}
	return {
		type: value.type,
		coordinates: canonicalCoordinates(value.coordinates, padZ),
	};
}

function geometryText(geometry: unknown): string {
	return JSON.stringify(canonicalGeometry(geometry, hasZ(geometry)));
}

function sortedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedKeys);
	if (!isObject(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortedKeys(value[key])]),
	);
}

function footprintKey(footprint: CsvSpatialFootprint): string {
	return JSON.stringify([
		footprint.geometries.map(geometryText).sort(),
		[...new Set(footprint.divisionIds)].sort(),
	]);
}

/** Total: a cell the strict parser rejects compares as key-sorted JSON, then as text, so an
 * exported cell always equals itself (6d-1 deferred-error rule). */
function comparisonKey(raw: string): string {
	const parsed = parseSpatialFootprintCell(raw);
	if (parsed.ok) return `footprint:${footprintKey(parsed.footprint)}`;
	try {
		return `json:${JSON.stringify(sortedKeys(JSON.parse(raw)))}`;
	} catch {
		return `text:${raw}`;
	}
}

/** Geometries as a multiset, division ids as a set, coordinates at PostGIS precision (D6). */
export function spatialFootprintEquals(a: string, b: string): boolean {
	return comparisonKey(a) === comparisonKey(b);
}

// --- Export (D8) ---

/** Geometries by canonical text, then divisions by id, so unchanged data exports byte-identical. */
export function formatSpatialFootprintCell(
	geometries: readonly unknown[],
	divisionIds: readonly string[],
): string {
	const geometryItems = [...geometries]
		.map((geometry) => ({ geometry, key: geometryText(geometry) }))
		.sort((a, b) => compareText(a.key, b.key))
		.map(({ geometry }) => ({
			map_option: MAP_COORDINATES,
			geojson: { type: "Feature", geometry, properties: {} },
		}));
	const divisionItems = [...divisionIds].sort(compareText).map((id) => ({
		map_option: GEOGRAPHIC_LEVEL,
		division_id: id,
		geojson: {
			type: "Feature",
			geometry: null,
			properties: { division_id: id },
		},
	}));
	return JSON.stringify([...geometryItems, ...divisionItems]);
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
