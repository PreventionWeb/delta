import { describe, expect, it } from "vitest";
import {
	formatSpatialFootprintCell,
	parseSpatialFootprintCell,
	spatialFootprintEquals,
} from "./spatialFootprintCsv";

const D1 = "694d72d0-0000-4000-8000-000000000001";
const D2 = "694d72d0-0000-4000-8000-000000000002";
const POINT = { type: "Point", coordinates: [77.2, 28.6] };
const LINE = {
	type: "LineString",
	coordinates: [
		[77, 28],
		[78, 29],
	],
};
const POLYGON = {
	type: "Polygon",
	coordinates: [
		[
			[77, 28],
			[78, 28],
			[78, 29],
			[77, 28],
		],
	],
};

function cell(items: unknown): string {
	return JSON.stringify(items);
}

function coordinatesItem(geojson: unknown) {
	return { map_option: "Map coordinates", geojson };
}

function feature(geometry: unknown) {
	return { type: "Feature", geometry, properties: {} };
}

function parsed(raw: string) {
	const result = parseSpatialFootprintCell(raw);
	if (!result.ok) {
		throw new Error(`expected a parse, got ${JSON.stringify(result)}`);
	}
	return result.footprint;
}

function rejected(raw: string) {
	return parseSpatialFootprintCell(raw);
}

describe("parseSpatialFootprintCell: accepted shapes (D2)", () => {
	it("L1: takes a Feature's geometry and a geojson.properties.division_id", () => {
		expect(
			parsed(
				cell([
					coordinatesItem(feature(POINT)),
					{
						map_option: "Geographic level",
						geojson: { properties: { division_id: D1 } },
					},
				]),
			),
		).toStrictEqual({ geometries: [POINT], divisionIds: [D1] });
	});

	it("L2: a FeatureCollection gives one geometry per feature (OD-5)", () => {
		expect(
			parsed(
				cell([
					coordinatesItem({
						type: "FeatureCollection",
						features: [feature(POINT), feature(LINE)],
					}),
				]),
			),
		).toStrictEqual({ geometries: [POINT, LINE], divisionIds: [] });
	});

	it("L3: a bare geometry is accepted as given", () => {
		expect(parsed(cell([coordinatesItem(POLYGON)]))).toStrictEqual({
			geometries: [POLYGON],
			divisionIds: [],
		});
	});

	it("L4: a top-level division_id is accepted", () => {
		expect(
			parsed(cell([{ map_option: "Geographic level", division_id: D1 }])),
		).toStrictEqual({ geometries: [], divisionIds: [D1] });
	});

	it("prefers geojson.properties.division_id over the top-level one", () => {
		expect(
			parsed(
				cell([
					{
						map_option: "Geographic level",
						division_id: D2,
						geojson: { properties: { division_id: D1 } },
					},
				]),
			).divisionIds,
		).toStrictEqual([D1]);
	});

	it("falls back to the top-level id when geojson has no division id", () => {
		expect(
			parsed(
				cell([
					{
						map_option: "Geographic level",
						division_id: D1,
						geojson: { type: "Feature", geometry: null, properties: {} },
					},
				]),
			).divisionIds,
		).toStrictEqual([D1]);
	});

	it("lower-cases a well-formed division UUID and keeps a malformed id as written", () => {
		expect(
			parsed(
				cell([
					{ map_option: "Geographic level", division_id: D1.toUpperCase() },
					{ map_option: "Geographic level", division_id: "ABC" },
				]),
			).divisionIds,
		).toStrictEqual([D1, "ABC"]);
	});

	it("collapses duplicate division ids, case-insensitively", () => {
		expect(
			parsed(
				cell([
					{ map_option: "Geographic level", division_id: D1 },
					{ map_option: "Geographic level", division_id: D1.toUpperCase() },
				]),
			).divisionIds,
		).toStrictEqual([D1]);
	});

	it("ignores item keys it does not use (OD-7)", () => {
		expect(
			parsed(
				cell([
					{
						id: "x",
						title: "Site",
						...coordinatesItem(feature(POINT)),
					},
					{
						map_option: "Geographic level",
						geographic_level: "State",
						division_ids: [D2],
						name: { en: "Alpha" },
						division_id: D1,
					},
				]),
			),
		).toStrictEqual({ geometries: [POINT], divisionIds: [D1] });
	});

	it("L9: [] parses to an empty footprint", () => {
		expect(parsed("[]")).toStrictEqual({ geometries: [], divisionIds: [] });
	});

	it("keeps only type and coordinates of a geometry", () => {
		expect(
			parsed(
				cell([
					coordinatesItem({
						...POINT,
						bbox: [77.2, 28.6, 77.2, 28.6],
						crs: { type: "name" },
						foreign: 1,
					}),
				]),
			).geometries,
		).toStrictEqual([POINT]);
	});

	it("accepts every RFC 7946 geometry type, nested collections included", () => {
		const geometries = [
			POINT,
			{ type: "MultiPoint", coordinates: [[77, 28]] },
			LINE,
			{ type: "MultiLineString", coordinates: [LINE.coordinates] },
			POLYGON,
			{ type: "MultiPolygon", coordinates: [POLYGON.coordinates] },
			{ type: "GeometryCollection", geometries: [POINT, LINE] },
		];
		expect(
			parsed(cell(geometries.map((g) => coordinatesItem(g)))).geometries,
		).toStrictEqual(geometries);
	});

	it("keeps a third ordinate", () => {
		const point = { type: "Point", coordinates: [77.2, 28.6, 120] };
		expect(parsed(cell([coordinatesItem(point)])).geometries).toStrictEqual([
			point,
		]);
	});

	it("accepts a clockwise ring, since winding is not checked (RFC 7946 §3.1.6)", () => {
		const clockwise = {
			type: "Polygon",
			coordinates: [
				[
					[77, 28],
					[77, 29],
					[78, 29],
					[77, 28],
				],
			],
		};
		expect(parsed(cell([coordinatesItem(clockwise)])).geometries).toStrictEqual(
			[clockwise],
		);
	});

	it("OD-4: a self-intersecting bowtie is structurally valid and kept as given", () => {
		const bowtie = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[1, 1],
					[1, 0],
					[0, 1],
					[0, 0],
				],
			],
		};
		expect(parsed(cell([coordinatesItem(bowtie)])).geometries).toStrictEqual([
			bowtie,
		]);
	});

	it("accepts empty multi-part coordinates", () => {
		const empty = { type: "MultiPoint", coordinates: [] };
		expect(parsed(cell([coordinatesItem(empty)])).geometries).toStrictEqual([
			empty,
		]);
	});
});

describe("parseSpatialFootprintCell: rejections (OD-3, RFC 7946)", () => {
	it("L10: unparseable JSON is a syntax error", () => {
		expect(rejected("{not json")).toStrictEqual({ ok: false, syntax: true });
	});

	it.each([
		["L8: an object", cell({ map_option: "Map coordinates" })],
		["a string", cell("x")],
		["null", "null"],
		["an item that is not an object", cell([1])],
		["a null item", cell([null])],
		["an array item", cell([[]])],
		["a missing map_option", cell([{ geojson: POINT }])],
		[
			"L12: an unknown map_option",
			cell([{ map_option: "Other", geojson: POINT }]),
		],
		[
			"a Map coordinates item without geojson",
			cell([{ map_option: "Map coordinates" }]),
		],
		["a Feature with a null geometry", cell([coordinatesItem(feature(null))])],
		[
			"a Feature without a geometry",
			cell([coordinatesItem({ type: "Feature" })]),
		],
		[
			"a FeatureCollection with no features",
			cell([coordinatesItem({ type: "FeatureCollection", features: [] })]),
		],
		[
			"a FeatureCollection whose features is not an array",
			cell([coordinatesItem({ type: "FeatureCollection", features: {} })]),
		],
		[
			"a FeatureCollection with a null-geometry feature",
			cell([
				coordinatesItem({
					type: "FeatureCollection",
					features: [feature(POINT), feature(null)],
				}),
			]),
		],
		[
			"a FeatureCollection with a non-object feature",
			cell([coordinatesItem({ type: "FeatureCollection", features: [1] })]),
		],
		[
			"an unknown geometry type",
			cell([coordinatesItem({ type: "Circle", coordinates: [1, 2] })]),
		],
		[
			"a Geographic level item without a division id",
			cell([{ map_option: "Geographic level", geojson: { properties: {} } }]),
		],
		[
			"a Geographic level item with an empty division id",
			cell([{ map_option: "Geographic level", division_id: "" }]),
		],
		[
			"a Geographic level item with a numeric division id",
			cell([{ map_option: "Geographic level", division_id: 7 }]),
		],
	])("rejects %s as content", (_, raw) => {
		expect(rejected(raw)).toStrictEqual({ ok: false, syntax: false });
	});

	it.each([
		["L7: string coordinates", { type: "Point", coordinates: "x" }],
		["a one-number position", { type: "Point", coordinates: [77] }],
		["an empty position", { type: "Point", coordinates: [] }],
		["a non-numeric ordinate", { type: "Point", coordinates: [77, "28"] }],
		["a null ordinate", { type: "Point", coordinates: [77, null] }],
		["missing coordinates", { type: "Point" }],
		[
			"a one-position LineString",
			{ type: "LineString", coordinates: [[77, 28]] },
		],
		[
			"an unclosed ring",
			{
				type: "Polygon",
				coordinates: [
					[
						[77, 28],
						[78, 28],
						[78, 29],
						[77, 29],
					],
				],
			},
		],
		[
			"a closed ring of three positions",
			{
				type: "Polygon",
				coordinates: [
					[
						[77, 28],
						[78, 28],
						[77, 28],
					],
				],
			},
		],
		[
			"a Polygon whose rings are not arrays",
			{ type: "Polygon", coordinates: [1] },
		],
		[
			"a MultiPoint with a bad position",
			{ type: "MultiPoint", coordinates: [[77]] },
		],
		[
			"a MultiLineString with a short line",
			{ type: "MultiLineString", coordinates: [[[77, 28]]] },
		],
		[
			"a MultiPolygon with an unclosed ring",
			{
				type: "MultiPolygon",
				coordinates: [
					[
						[
							[0, 0],
							[1, 0],
							[1, 1],
							[0, 2],
						],
					],
				],
			},
		],
		["a GeometryCollection without geometries", { type: "GeometryCollection" }],
		[
			"a GeometryCollection holding a broken geometry",
			{ type: "GeometryCollection", geometries: [{ type: "Point" }] },
		],
		[
			"a GeometryCollection holding a non-object",
			{ type: "GeometryCollection", geometries: [1] },
		],
	])("rejects %s as content", (_, geometry) => {
		expect(rejected(cell([coordinatesItem(geometry)]))).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});

	it("rejects a non-finite ordinate that JSON cannot carry but a large exponent yields", () => {
		expect(
			rejected(
				'[{"map_option":"Map coordinates","geojson":{"type":"Point","coordinates":[1e999,0]}}]',
			),
		).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});
});

describe("formatSpatialFootprintCell (D8)", () => {
	it("writes one Feature item per geometry, then a minimal item per division", () => {
		expect(JSON.parse(formatSpatialFootprintCell([POINT], [D1]))).toStrictEqual(
			[
				{
					map_option: "Map coordinates",
					geojson: { type: "Feature", geometry: POINT, properties: {} },
				},
				{
					map_option: "Geographic level",
					division_id: D1,
					geojson: {
						type: "Feature",
						geometry: null,
						properties: { division_id: D1 },
					},
				},
			],
		);
	});

	it("writes [] for an empty footprint", () => {
		expect(formatSpatialFootprintCell([], [])).toBe("[]");
	});

	it("orders geometries by canonical text and divisions by id", () => {
		const a = formatSpatialFootprintCell([POLYGON, POINT, LINE], [D2, D1]);
		const b = formatSpatialFootprintCell([LINE, POINT, POLYGON], [D1, D2]);
		expect(a).toBe(b);
		const items = JSON.parse(a) as { division_id?: string }[];
		expect(items.slice(3).map((item) => item.division_id)).toStrictEqual([
			D1,
			D2,
		]);
	});

	it("round-trips through the parser", () => {
		const geometries = [POINT, LINE, POLYGON];
		const formatted = formatSpatialFootprintCell(geometries, [D2, D1]);
		const back = parsed(formatted);
		expect(new Set(back.divisionIds)).toStrictEqual(new Set([D1, D2]));
		expect(back.geometries).toHaveLength(3);
		expect(
			spatialFootprintEquals(
				formatted,
				cell([
					coordinatesItem(POLYGON),
					coordinatesItem(feature(POINT)),
					coordinatesItem(LINE),
					{ map_option: "Geographic level", division_id: D1 },
					{
						map_option: "Geographic level",
						geojson: { properties: { division_id: D2 } },
					},
				]),
			),
		).toBe(true);
	});
});

describe("spatialFootprintEquals (D6, OD-8)", () => {
	const base = formatSpatialFootprintCell([POINT, LINE], [D1, D2]);

	it("ignores item order, JSON formatting and how an item is written", () => {
		const reordered = JSON.stringify(
			[
				{ map_option: "Geographic level", division_id: D2 },
				coordinatesItem(LINE),
				{ map_option: "Geographic level", division_id: D1.toUpperCase() },
				coordinatesItem({
					type: "FeatureCollection",
					features: [feature(POINT)],
				}),
			],
			null,
			2,
		);
		expect(spatialFootprintEquals(reordered, base)).toBe(true);
	});

	it("compares division ids as a set", () => {
		const dup = cell([
			coordinatesItem(POINT),
			coordinatesItem(LINE),
			{ map_option: "Geographic level", division_id: D1 },
			{ map_option: "Geographic level", division_id: D1 },
			{ map_option: "Geographic level", division_id: D2 },
		]);
		expect(spatialFootprintEquals(dup, base)).toBe(true);
	});

	it("compares geometries as a multiset", () => {
		const twice = cell([coordinatesItem(POINT), coordinatesItem(POINT)]);
		const once = cell([coordinatesItem(POINT)]);
		expect(spatialFootprintEquals(twice, once)).toBe(false);
		expect(
			spatialFootprintEquals(
				twice,
				cell([coordinatesItem(POINT), coordinatesItem(feature(POINT))]),
			),
		).toBe(true);
	});

	it("detects a different geometry, an added or removed division", () => {
		expect(
			spatialFootprintEquals(
				formatSpatialFootprintCell([POINT], [D1, D2]),
				base,
			),
		).toBe(false);
		expect(
			spatialFootprintEquals(
				formatSpatialFootprintCell([POINT, LINE], [D1]),
				base,
			),
		).toBe(false);
		expect(
			spatialFootprintEquals(
				formatSpatialFootprintCell([POINT, POLYGON], [D1, D2]),
				base,
			),
		).toBe(false);
	});

	it("treats [] as equal only to an empty footprint", () => {
		expect(
			spatialFootprintEquals("[]", formatSpatialFootprintCell([], [])),
		).toBe(true);
		expect(spatialFootprintEquals("[]", base)).toBe(false);
	});

	it("OD-8: compares coordinates rounded to PostGIS's 9 decimal places", () => {
		const precise = cell([
			coordinatesItem({
				type: "Point",
				coordinates: [77.123456789012345, 28.6],
			}),
		]);
		const stored = cell([
			coordinatesItem({ type: "Point", coordinates: [77.123456789, 28.6] }),
		]);
		const different = cell([
			coordinatesItem({ type: "Point", coordinates: [77.123456788, 28.6] }),
		]);
		expect(spatialFootprintEquals(precise, stored)).toBe(true);
		expect(spatialFootprintEquals(precise, different)).toBe(false);
	});

	function point(x: number): string {
		return cell([coordinatesItem({ type: "Point", coordinates: [x, 0] })]);
	}

	// Pinned against PostGIS in DrizzleHazardousEventRepository.test.ts.
	it.each([
		[2.0000000005, 2],
		[0.1234567895, 0.12345679],
		[-77.1234567895, -77.12345679],
		[0.99999999995, 1],
		[1.0000000006, 1.000000001],
		[0.1234567894999, 0.123456789],
		[12.3456789012345, 12.345678901],
		[0.0000123456789, 0.000012346],
		[1.04e-8, 0.00000001],
		[1234567890.1234567, 1234567890.1234567],
	])("OD-8: %s equals PostGIS's printed %s", (input, printed) => {
		expect(spatialFootprintEquals(point(input), point(printed))).toBe(true);
	});

	it.each([1e-8, -1e-8, 9.9e-9, 1.5e-9, 1e15, 1.5e15])(
		"OD-8: %s is compared unrounded, as PostGIS prints it",
		(input) => {
			expect(spatialFootprintEquals(point(input), point(input))).toBe(true);
			expect(spatialFootprintEquals(point(input), point(0))).toBe(false);
		},
	);

	it("OD-8: a difference at the ninth decimal, or between tiny values, is a change", () => {
		expect(spatialFootprintEquals(point(0.123456789), point(0.123456788))).toBe(
			false,
		);
		expect(spatialFootprintEquals(point(1.5e-9), point(1.6e-9))).toBe(false);
		expect(spatialFootprintEquals(point(2e15), point(2e15 + 2))).toBe(false);
	});

	it("treats a negative zero as zero", () => {
		expect(spatialFootprintEquals(point(-0), point(0))).toBe(true);
	});

	it("ignores a fourth ordinate, which PostGIS drops", () => {
		expect(
			spatialFootprintEquals(
				cell([coordinatesItem({ type: "Point", coordinates: [1, 2, 3, 4] })]),
				cell([coordinatesItem({ type: "Point", coordinates: [1, 2, 3] })]),
			),
		).toBe(true);
	});

	it("ignores geometry members PostGIS drops (bbox, crs, foreign members)", () => {
		expect(
			spatialFootprintEquals(
				cell([coordinatesItem({ ...POINT, bbox: [1, 2, 3, 4] })]),
				cell([coordinatesItem(POINT)]),
			),
		).toBe(true);
	});

	it("compares text it cannot parse as written, so any exported cell equals itself", () => {
		const exportedEmptyPoint = cell([
			coordinatesItem(feature({ type: "Point", coordinates: [] })),
		]);
		expect(spatialFootprintEquals(exportedEmptyPoint, exportedEmptyPoint)).toBe(
			true,
		);
		expect(
			spatialFootprintEquals(
				JSON.stringify(JSON.parse(exportedEmptyPoint), null, 2),
				exportedEmptyPoint,
			),
		).toBe(true);
		expect(spatialFootprintEquals("{not json", "{not json")).toBe(true);
		expect(spatialFootprintEquals("{not json", base)).toBe(false);
		expect(spatialFootprintEquals(exportedEmptyPoint, base)).toBe(false);
	});
});

describe("spatialFootprintCsv: hostile and edge input (6d-2 review fixes)", () => {
	function geometryCell(geojson: unknown): string {
		return cell([coordinatesItem(geojson)]);
	}

	function nestedCollection(depth: number): unknown {
		return JSON.parse(nestedCollectionText(depth));
	}

	/** Built as text: JSON.stringify itself overflows the stack at these depths. */
	function nestedCollectionText(depth: number): string {
		const open = '{"type":"GeometryCollection","geometries":['.repeat(depth);
		return `${open}${JSON.stringify(POINT)}${"]}".repeat(depth)}`;
	}

	function deepCell(depth: number): string {
		return `[{"map_option":"Map coordinates","geojson":${nestedCollectionText(depth)}}]`;
	}

	it.each([
		"valueOf",
		"__proto__",
		"toString",
		"constructor",
		"hasOwnProperty",
		"isPrototypeOf",
	])(
		"rejects the inherited name %j as a geometry type, without throwing",
		(type) => {
			expect(
				parseSpatialFootprintCell(geometryCell({ type, coordinates: [0, 0] })),
			).toStrictEqual({ ok: false, syntax: false });
		},
	);

	it("accepts GeometryCollections nested up to the depth limit", () => {
		expect(
			parseSpatialFootprintCell(geometryCell(nestedCollection(8))).ok,
		).toBe(true);
	});

	it("rejects GeometryCollections nested beyond the depth limit", () => {
		expect(
			parseSpatialFootprintCell(geometryCell(nestedCollection(9))),
		).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});

	it("rejects a 5,000-deep GeometryCollection as content instead of overflowing the stack", () => {
		expect(parseSpatialFootprintCell(deepCell(5000))).toStrictEqual({
			ok: false,
			syntax: false,
		});
	});

	it("compares a 5,000-deep cell with itself without throwing", () => {
		const deep = deepCell(5000);
		expect(spatialFootprintEquals(deep, deep)).toBe(true);
		expect(spatialFootprintEquals(deep, "[]")).toBe(false);
	});

	it("accepts a FeatureCollection of 150,000 features", () => {
		const features = Array.from({ length: 150_000 }, () => feature(POINT));
		const result = parseSpatialFootprintCell(
			geometryCell({ type: "FeatureCollection", features }),
		);
		expect(result.ok && result.footprint.geometries.length).toBe(150_000);
	});

	// PostGIS pads a 2D position with Z=0 when any position of the geometry has Z.
	it.each([
		[
			{
				type: "LineString",
				coordinates: [
					[0, 0],
					[1, 1, 5],
				],
			},
			{
				type: "LineString",
				coordinates: [
					[0, 0, 0],
					[1, 1, 5],
				],
			},
		],
		[
			{
				type: "MultiPoint",
				coordinates: [
					[0, 0],
					[1, 1, 5],
				],
			},
			{
				type: "MultiPoint",
				coordinates: [
					[0, 0, 0],
					[1, 1, 5],
				],
			},
		],
		[
			{
				type: "GeometryCollection",
				geometries: [
					{ type: "Point", coordinates: [0, 0] },
					{ type: "Point", coordinates: [1, 1, 5] },
				],
			},
			{
				type: "GeometryCollection",
				geometries: [
					{ type: "Point", coordinates: [0, 0, 0] },
					{ type: "Point", coordinates: [1, 1, 5] },
				],
			},
		],
	])(
		"compares mixed 2D/3D input %j equal to its Z-padded export",
		(input, stored) => {
			expect(
				spatialFootprintEquals(geometryCell(input), geometryCell(stored)),
			).toBe(true);
		},
	);

	it("does not pad a geometry that has no Z", () => {
		expect(
			spatialFootprintEquals(
				geometryCell({
					type: "LineString",
					coordinates: [
						[0, 0],
						[1, 1],
					],
				}),
				geometryCell({
					type: "LineString",
					coordinates: [
						[0, 0, 0],
						[1, 1, 0],
					],
				}),
			),
		).toBe(false);
	});
});
