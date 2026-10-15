import { describe, expect, it } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import {
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
} from "~/shared/errors";
import type { Pagination } from "~/shared/types";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "./IHazardousEventRepository";

const baseHazardousEventProps: HazardousEventProps = {
	id: "he-1",
	tenantId: "tenant-1",
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "",
	nationalSpecification: "",
	description: "",
	chainsExplanation: "",
	magnitude: "",
	recordOriginator: "",
	dataSource: "",
	hazardousEventStatus: null,
	specificHazardLocalName: null,
	specificHazardNationalName: null,
	apiImportId: null,
	createdByUserId: null,
	updatedByUserId: null,
	submittedByUserId: null,
	submittedAt: null,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: null,
	hazardDriverIds: [],
	attachments: [],
	fieldValues: [],
	customFieldValues: [],
};

function makeHazardousEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseHazardousEventProps, ...overrides },
		new Set(),
		new Set(),
	);
}

function makeSpatialObservation(
	overrides: Partial<SpatialObservationRecord> = {},
): SpatialObservationRecord {
	return {
		id: "observation-1",
		hazardousEventId: "he-1",
		observationTime: new Date("2026-01-02T00:00:00Z"),
		note: null,
		geometries: [],
		divisionIds: [],
		createdAt: new Date("2026-01-02T00:00:00Z"),
		updatedAt: new Date("2026-01-02T00:00:00Z"),
		...overrides,
	};
}

/**
 * Fake conformance implementation (matches 3a's FakeWorkflowRepository pattern), keyed on tenantId:id.
 * saveSpatialObservation is last-write-wins -- the fake's own choice; the real conflict contract is Phase 3d's job (Decision 7).
 * insert/update replace save (Decision 1), scoped to this fake's own tenantId:id key -- weaker than the real adapter's global-PK uniqueness.
 */
class FakeHazardousEventRepository implements IHazardousEventRepository {
	private readonly store = new Map<string, HazardousEvent>();
	private readonly spatialObservations = new Map<
		string,
		SpatialObservationRecord
	>();
	private readonly disasterEventReferences = new Map<string, string[]>();

	private key(id: string, tenantId: string): string {
		return `${tenantId}:${id}`;
	}

	private spatialKey(hazardousEventId: string, observationTime: Date): string {
		return `${hazardousEventId}:${observationTime.toISOString()}`;
	}

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		const found = this.store.get(this.key(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async findAll(
		tenantId: string,
		pagination: Pagination,
	): Promise<HazardousEvent[]> {
		const all = [...this.store.values()].filter(
			(entity) => entity.tenantId === tenantId,
		);
		const start = (pagination.page - 1) * pagination.pageSize;
		return all.slice(start, start + pagination.pageSize);
	}

	async insert(entity: HazardousEvent): Promise<HazardousEvent> {
		const key = this.key(entity.id, entity.tenantId);
		if (this.store.has(key)) {
			// Plain write that rejects on an id collision, never silently overwriting (port spec).
			throw new ConflictError(
				"HazardousEvent already exists for this id/tenantId",
				{ id: entity.id, tenantId: entity.tenantId },
			);
		}
		this.store.set(key, entity);
		return entity;
	}

	/** In-memory equality against the stored entity's own updatedAt, including the null branch (never updated since insert()) -- the real conditional-SQL CAS is the adapter's concern. */
	async update(
		entity: HazardousEvent,
		expectedUpdatedAt: Date | null,
	): Promise<HazardousEvent> {
		const key = this.key(entity.id, entity.tenantId);
		const current = this.store.get(key);

		if (current === undefined) {
			// Covers both "never existed" and "a delete() already removed it" (no resurrection).
			throw new ConcurrentModificationError(
				"HazardousEvent no longer exists for this id/tenantId",
				{ id: entity.id, tenantId: entity.tenantId },
			);
		}

		const currentUpdatedAt = current.updatedAt;
		const matches =
			currentUpdatedAt === null
				? expectedUpdatedAt === null
				: expectedUpdatedAt !== null &&
					currentUpdatedAt.getTime() === expectedUpdatedAt.getTime();
		if (!matches) {
			throw new ConcurrentModificationError(
				"HazardousEvent has been modified since it was read",
				{ id: entity.id, tenantId: entity.tenantId },
			);
		}

		this.store.set(key, entity);
		return entity;
	}

	async delete(id: string, tenantId: string): Promise<void> {
		this.store.delete(this.key(id, tenantId));
	}

	seedDisasterEventReference(
		hazardousEventId: string,
		disasterEventTenantId: string,
	): void {
		const existing = this.disasterEventReferences.get(hazardousEventId) ?? [];
		existing.push(disasterEventTenantId);
		this.disasterEventReferences.set(hazardousEventId, existing);
	}

	async countReferencingDisasterEvents(
		hazardousEventId: string,
		// Intentionally unused: scopes the HE side only, never filters the counted disaster_event rows.
		_tenantId: string,
	): Promise<number> {
		return (this.disasterEventReferences.get(hazardousEventId) ?? []).length;
	}

	async findCurrentSpatialObservation(
		hazardousEventId: string,
		// Intentionally unused by this fake -- the real tenant-scoped check is Phase 3d's adapter job (design.md Decision 6).
		_tenantId: string,
	): Promise<SpatialObservationRecord | null> {
		const observations = [...this.spatialObservations.values()].filter(
			(observation) => observation.hazardousEventId === hazardousEventId,
		);
		if (observations.length === 0) return null;
		return observations.reduce((latest, observation) =>
			observation.observationTime > latest.observationTime
				? observation
				: latest,
		);
	}

	async findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		_tenantId: string,
	): Promise<SpatialObservationRecord | null> {
		return (
			this.spatialObservations.get(
				this.spatialKey(hazardousEventId, observationTime),
			) ?? null
		);
	}

	async saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		_tenantId: string,
	): Promise<SpatialObservationRecord> {
		this.spatialObservations.set(
			this.spatialKey(hazardousEventId, observation.observationTime),
			observation,
		);
		return observation;
	}
}

describe("IHazardousEventRepository conformance", () => {
	describe("findById", () => {
		it("throws NotFoundError when no entity exists for the given id and tenantId", async () => {
			const repo = new FakeHazardousEventRepository();

			await expect(repo.findById("missing-id", "tenant-1")).rejects.toThrow(
				NotFoundError,
			);
		});

		it("resolves the saved entity when one exists for the given id and tenantId", async () => {
			const repo = new FakeHazardousEventRepository();
			const entity = makeHazardousEvent({ id: "he-2", tenantId: "tenant-2" });
			await repo.insert(entity);

			await expect(repo.findById("he-2", "tenant-2")).resolves.toBe(entity);
		});
	});

	describe("findAll", () => {
		it("returns only entities matching the given tenantId", async () => {
			const repo = new FakeHazardousEventRepository();
			await repo.insert(
				makeHazardousEvent({ id: "he-1", tenantId: "tenant-1" }),
			);
			await repo.insert(
				makeHazardousEvent({ id: "he-2", tenantId: "tenant-2" }),
			);

			const result = await repo.findAll("tenant-1", { page: 1, pageSize: 10 });

			expect(result.map((entity) => entity.id)).toEqual(["he-1"]);
		});

		it("respects page and pageSize", async () => {
			const repo = new FakeHazardousEventRepository();
			await repo.insert(
				makeHazardousEvent({ id: "he-1", tenantId: "tenant-1" }),
			);
			await repo.insert(
				makeHazardousEvent({ id: "he-2", tenantId: "tenant-1" }),
			);
			await repo.insert(
				makeHazardousEvent({ id: "he-3", tenantId: "tenant-1" }),
			);

			const firstPage = await repo.findAll("tenant-1", {
				page: 1,
				pageSize: 2,
			});
			const secondPage = await repo.findAll("tenant-1", {
				page: 2,
				pageSize: 2,
			});

			expect(firstPage.map((entity) => entity.id)).toEqual(["he-1", "he-2"]);
			expect(secondPage.map((entity) => entity.id)).toEqual(["he-3"]);
		});
	});

	describe("insert", () => {
		it("rejects an id collision rather than silently overwriting the existing row", async () => {
			const repo = new FakeHazardousEventRepository();
			const original = makeHazardousEvent({ id: "he-1", tenantId: "tenant-1" });
			await repo.insert(original);

			const colliding = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				description: "a different event sharing the same id",
			});
			await expect(repo.insert(colliding)).rejects.toThrow(ConflictError);
			await expect(repo.findById("he-1", "tenant-1")).resolves.toBe(original);
		});
	});

	describe("update", () => {
		it("persists a matching expectedUpdatedAt and resolves the updated entity", async () => {
			const repo = new FakeHazardousEventRepository();
			const original = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await repo.insert(original);

			const changed = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
				description: "changed",
			});
			await expect(repo.update(changed, original.updatedAt)).resolves.toBe(
				changed,
			);
			await expect(repo.findById("he-1", "tenant-1")).resolves.toBe(changed);
		});

		it("accepts a null expectedUpdatedAt for a row never updated since insert()", async () => {
			const repo = new FakeHazardousEventRepository();
			// updatedAt: null in baseHazardousEventProps -- never updated since insert().
			const original = makeHazardousEvent({ id: "he-1", tenantId: "tenant-1" });
			await repo.insert(original);

			const changed = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			});
			await expect(repo.update(changed, null)).resolves.toBe(changed);
		});

		it("rejects with ConcurrentModificationError when expectedUpdatedAt no longer matches the stored entity (stale write)", async () => {
			const repo = new FakeHazardousEventRepository();
			const original = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await repo.insert(original);
			const winner = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			});
			await repo.update(winner, original.updatedAt);

			const stale = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-04T00:00:00Z"),
			});
			await expect(repo.update(stale, original.updatedAt)).rejects.toThrow(
				ConcurrentModificationError,
			);
		});

		it("rejects with ConcurrentModificationError, not resurrecting the row, when delete() already removed it", async () => {
			const repo = new FakeHazardousEventRepository();
			const original = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			});
			await repo.insert(original);
			await repo.delete("he-1", "tenant-1");

			const stale = makeHazardousEvent({
				id: "he-1",
				tenantId: "tenant-1",
				updatedAt: new Date("2026-01-03T00:00:00Z"),
			});
			await expect(repo.update(stale, original.updatedAt)).rejects.toThrow(
				ConcurrentModificationError,
			);
			await expect(repo.findById("he-1", "tenant-1")).rejects.toThrow(
				NotFoundError,
			);
		});
	});

	describe("delete", () => {
		it("resolves normally, not throwing, for an id/tenantId pair with no matching row", async () => {
			const repo = new FakeHazardousEventRepository();

			await expect(
				repo.delete("missing-id", "tenant-1"),
			).resolves.toBeUndefined();
		});

		it("does not remove a same-id row belonging to a different tenant", async () => {
			const repo = new FakeHazardousEventRepository();
			const tenantOneEntity = makeHazardousEvent({
				id: "he-shared-id",
				tenantId: "tenant-1",
			});
			// Same id, different tenant -- the fake's Map key includes tenantId, so this is a distinct row, not an overwrite.
			const tenantTwoEntity = makeHazardousEvent({
				id: "he-shared-id",
				tenantId: "tenant-2",
			});
			await repo.insert(tenantOneEntity);
			await repo.insert(tenantTwoEntity);

			await repo.delete("he-shared-id", "tenant-1");

			await expect(repo.findById("he-shared-id", "tenant-2")).resolves.toBe(
				tenantTwoEntity,
			);
			await expect(repo.findById("he-shared-id", "tenant-1")).rejects.toThrow(
				NotFoundError,
			);
		});
	});

	describe("findCurrentSpatialObservation", () => {
		it("resolves null, not a thrown error, when no spatial observation exists yet", async () => {
			const repo = new FakeHazardousEventRepository();

			await expect(
				repo.findCurrentSpatialObservation("he-1", "tenant-1"),
			).resolves.toBeNull();
		});

		it("resolves the latest-by-observationTime reading when multiple exist", async () => {
			const repo = new FakeHazardousEventRepository();
			const earlier = makeSpatialObservation({
				id: "obs-1",
				observationTime: new Date("2026-01-01T00:00:00Z"),
			});
			const later = makeSpatialObservation({
				id: "obs-2",
				observationTime: new Date("2026-01-05T00:00:00Z"),
			});
			await repo.saveSpatialObservation("he-1", earlier, "tenant-1");
			await repo.saveSpatialObservation("he-1", later, "tenant-1");

			const current = await repo.findCurrentSpatialObservation(
				"he-1",
				"tenant-1",
			);

			expect(current?.id).toBe("obs-2");
		});
	});

	describe("findSpatialObservationByTime", () => {
		it("matches an exact observationTime", async () => {
			const repo = new FakeHazardousEventRepository();
			const observationTime = new Date("2026-01-02T00:00:00Z");
			const observation = makeSpatialObservation({ observationTime });
			await repo.saveSpatialObservation("he-1", observation, "tenant-1");

			const found = await repo.findSpatialObservationByTime(
				"he-1",
				observationTime,
				"tenant-1",
			);

			expect(found?.id).toBe(observation.id);
		});

		it("returns null for a different observationTime", async () => {
			const repo = new FakeHazardousEventRepository();
			const observation = makeSpatialObservation({
				observationTime: new Date("2026-01-02T00:00:00Z"),
			});
			await repo.saveSpatialObservation("he-1", observation, "tenant-1");

			const found = await repo.findSpatialObservationByTime(
				"he-1",
				new Date("2026-01-03T00:00:00Z"),
				"tenant-1",
			);

			expect(found).toBeNull();
		});
	});

	describe("countReferencingDisasterEvents", () => {
		it("resolves zero when no disaster_event row references the given hazardousEventId", async () => {
			const repo = new FakeHazardousEventRepository();

			await expect(
				repo.countReferencingDisasterEvents("he-1", "tenant-1"),
			).resolves.toBe(0);
		});

		it("resolves the count of multiple referencing disaster_event rows", async () => {
			const repo = new FakeHazardousEventRepository();
			repo.seedDisasterEventReference("he-1", "tenant-1");
			repo.seedDisasterEventReference("he-1", "tenant-1");

			await expect(
				repo.countReferencingDisasterEvents("he-1", "tenant-1"),
			).resolves.toBe(2);
		});

		it("still counts a referencing disaster_event row belonging to a different tenant", async () => {
			const repo = new FakeHazardousEventRepository();
			repo.seedDisasterEventReference("he-1", "tenant-2");

			await expect(
				repo.countReferencingDisasterEvents("he-1", "tenant-1"),
			).resolves.toBe(1);
		});
	});

	// Concurrent-callers scenario required by spec hazardous-event-repository-port and design.md Decision 7.
	describe("Concurrent saveSpatialObservation calls for the same hazardousEventId + observationTime", () => {
		it("pins the fake's own last-write-wins behavior: exactly one row survives once both calls resolve", async () => {
			const repo = new FakeHazardousEventRepository();
			const observationTime = new Date("2026-01-02T00:00:00Z");
			const first = makeSpatialObservation({
				id: "obs-first",
				observationTime,
				note: "first caller",
			});
			const second = makeSpatialObservation({
				id: "obs-second",
				observationTime,
				note: "second caller",
			});

			// Both callers already resolved "no conflict" before racing in via Promise.all, not sequential calls.
			const [, secondResult] = await Promise.all([
				repo.saveSpatialObservation("he-1", first, "tenant-1"),
				repo.saveSpatialObservation("he-1", second, "tenant-1"),
			]);

			const current = await repo.findCurrentSpatialObservation(
				"he-1",
				"tenant-1",
			);
			// Cross-checked via a second, independent lookup path -- both must agree, not just "current" (Gate 8 nitpick).
			const byTime = await repo.findSpatialObservationByTime(
				"he-1",
				observationTime,
				"tenant-1",
			);

			// Last-write-wins on the composite key is the fake's own documented behavior, not a claim about the real DB's race (that's 3d's job).
			expect(current?.id).toBe(secondResult.id);
			expect(current?.note).toBe("second caller");
			expect(byTime?.id).toBe(secondResult.id);
		});
	});
});

// Tuple equality (not assignability), so a dropped/added param fails to compile (matches IWorkflowRepository.test.ts).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findByIdArity: AssertEqual<
	Parameters<IHazardousEventRepository["findById"]>,
	[string, string]
> = true;
const _findAllArity: AssertEqual<
	Parameters<IHazardousEventRepository["findAll"]>,
	[string, Pagination]
> = true;
const _insertArity: AssertEqual<
	Parameters<IHazardousEventRepository["insert"]>,
	[HazardousEvent]
> = true;
// Fails to compile if expectedUpdatedAt is made optional (Date | null | undefined isn't the required tuple) -- the compile-time guard Decision 2 relies on.
const _updateArity: AssertEqual<
	Parameters<IHazardousEventRepository["update"]>,
	[HazardousEvent, Date | null]
> = true;
const _deleteArity: AssertEqual<
	Parameters<IHazardousEventRepository["delete"]>,
	[string, string]
> = true;
const _findCurrentSpatialObservationArity: AssertEqual<
	Parameters<IHazardousEventRepository["findCurrentSpatialObservation"]>,
	[string, string]
> = true;
const _findSpatialObservationByTimeArity: AssertEqual<
	Parameters<IHazardousEventRepository["findSpatialObservationByTime"]>,
	[string, Date, string]
> = true;
const _saveSpatialObservationArity: AssertEqual<
	Parameters<IHazardousEventRepository["saveSpatialObservation"]>,
	[string, SpatialObservationRecord, string]
> = true;
const _countReferencingDisasterEventsArity: AssertEqual<
	Parameters<IHazardousEventRepository["countReferencingDisasterEvents"]>,
	[string, string]
> = true;

void _findByIdArity;
void _findAllArity;
void _insertArity;
void _updateArity;
void _deleteArity;
void _findCurrentSpatialObservationArity;
void _findSpatialObservationByTimeArity;
void _saveSpatialObservationArity;
void _countReferencingDisasterEventsArity;
