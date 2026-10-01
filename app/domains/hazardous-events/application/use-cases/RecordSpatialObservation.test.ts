import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { ConflictError, NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../ports/IHazardousEventRepository";
import type { IDivisionRepository } from "../ports/IDivisionRepository";
import {
	RecordSpatialObservationUseCase,
	type RecordSpatialObservationCommand,
} from "./RecordSpatialObservation";

class FakeLogger implements ILogger {
	info = vi.fn();
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();
}

interface FindByIdCall {
	id: string;
	tenantId: string;
}

interface FindSpatialObservationByTimeCall {
	hazardousEventId: string;
	observationTime: Date;
	tenantId: string;
}

interface SaveSpatialObservationCall {
	hazardousEventId: string;
	observation: SpatialObservationRecord;
	tenantId: string;
}

/** Call-arg capture fake. `saveSpatialObservation` returns a distinct record (updatedAt +1s).
 * `simulateUniqueConstraint` simulates the DB's unique constraint for the concurrent-callers
 * test (Decision 6), off by default. */
class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly findByIdCalls: FindByIdCall[] = [];
	readonly findSpatialObservationByTimeCalls: FindSpatialObservationByTimeCall[] =
		[];
	readonly saveSpatialObservationCalls: SaveSpatialObservationCall[] = [];
	readonly thrownConflictErrors: ConflictError[] = [];

	simulateUniqueConstraint = false;
	/** When set, findSpatialObservationByTime always resolves this value regardless of the
	 * store's contents -- used to force "both concurrent readers observed null before either
	 * wrote" deterministically, without relying on microtask interleaving timing. */
	findSpatialObservationByTimeOverride?: SpatialObservationRecord | null;

	private readonly events = new Map<string, HazardousEvent>();
	private readonly spatialObservations = new Map<
		string,
		SpatialObservationRecord
	>();

	constructor(seedEvents: readonly HazardousEvent[] = []) {
		for (const event of seedEvents) {
			this.events.set(this.eventKey(event.id, event.tenantId), event);
		}
	}

	private eventKey(id: string, tenantId: string): string {
		return `${tenantId}:${id}`;
	}

	private spatialKey(hazardousEventId: string, observationTime: Date): string {
		return `${hazardousEventId}:${observationTime.toISOString()}`;
	}

	seedSpatialObservation(
		hazardousEventId: string,
		record: SpatialObservationRecord,
	): void {
		this.spatialObservations.set(
			this.spatialKey(hazardousEventId, record.observationTime),
			record,
		);
	}

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		this.findByIdCalls.push({ id, tenantId });
		const found = this.events.get(this.eventKey(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async findAll(): Promise<HazardousEvent[]> {
		throw new Error("not used by RecordSpatialObservationUseCase's own tests");
	}

	async save(): Promise<HazardousEvent> {
		throw new Error("not used by RecordSpatialObservationUseCase's own tests");
	}

	async delete(): Promise<void> {
		throw new Error("not used by RecordSpatialObservationUseCase's own tests");
	}

	async findCurrentSpatialObservation(): Promise<never> {
		throw new Error("not used by RecordSpatialObservationUseCase's own tests");
	}

	async findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		tenantId: string,
	): Promise<SpatialObservationRecord | null> {
		this.findSpatialObservationByTimeCalls.push({
			hazardousEventId,
			observationTime,
			tenantId,
		});
		if (this.findSpatialObservationByTimeOverride !== undefined) {
			return this.findSpatialObservationByTimeOverride;
		}
		return (
			this.spatialObservations.get(
				this.spatialKey(hazardousEventId, observationTime),
			) ?? null
		);
	}

	async saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		tenantId: string,
	): Promise<SpatialObservationRecord> {
		this.saveSpatialObservationCalls.push({
			hazardousEventId,
			observation,
			tenantId,
		});
		const key = this.spatialKey(hazardousEventId, observation.observationTime);
		if (this.simulateUniqueConstraint && this.spatialObservations.has(key)) {
			const conflict = new ConflictError(
				`duplicate observation for ${hazardousEventId} at ${observation.observationTime.toISOString()}`,
			);
			this.thrownConflictErrors.push(conflict);
			throw conflict;
		}
		const saved: SpatialObservationRecord = {
			...observation,
			updatedAt: new Date(observation.updatedAt.getTime() + 1000),
		};
		this.spatialObservations.set(key, saved);
		return saved;
	}
}

interface DivisionLookupCall {
	ids: readonly string[];
	tenantId: string;
}

class FakeDivisionRepository implements IDivisionRepository {
	readonly findValidDivisionIdsCalls: DivisionLookupCall[] = [];

	constructor(private readonly validDivisionIds: ReadonlySet<string>) {}

	async findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>> {
		this.findValidDivisionIdsCalls.push({ ids, tenantId });
		return new Set(ids.filter((id) => this.validDivisionIds.has(id)));
	}
}

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
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
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

function makeSpatialObservationRecord(
	overrides: Partial<SpatialObservationRecord> = {},
): SpatialObservationRecord {
	return {
		id: "observation-existing",
		hazardousEventId: "he-1",
		observationTime: new Date("2026-01-02T00:00:00.000Z"),
		note: "prior note",
		geometries: [{ type: "Point", coordinates: [1, 1] }],
		divisionIds: ["div-existing"],
		createdAt: new Date("2026-01-01T12:00:00.000Z"),
		updatedAt: new Date("2026-01-01T12:00:00.000Z"),
		...overrides,
	};
}

function makeCommand(
	overrides: Partial<RecordSpatialObservationCommand> = {},
): RecordSpatialObservationCommand {
	return {
		tenantId: "tenant-1",
		hazardousEventId: "he-1",
		geometries: [{ type: "Point", coordinates: [2, 2] }],
		divisionIds: [],
		...overrides,
	};
}

function createHarness(
	options: {
		events?: readonly HazardousEvent[];
		validDivisionIds?: ReadonlySet<string>;
	} = {},
) {
	const logger = new FakeLogger();
	const hazardousEventRepository = new FakeHazardousEventRepository(
		options.events ?? [makeHazardousEvent()],
	);
	const divisionRepository = new FakeDivisionRepository(
		options.validDivisionIds ?? new Set(),
	);
	const useCase = new RecordSpatialObservationUseCase(
		logger,
		hazardousEventRepository,
		divisionRepository,
	);
	return { logger, hazardousEventRepository, divisionRepository, useCase };
}

/** Captures a rejected promise's reason without a repeated `execute()` call (which would
 * double-count side-effect call assertions). Throws if the promise unexpectedly resolves. */
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the promise to reject");
}

describe("RecordSpatialObservationUseCase", () => {
	describe("command shape validation", () => {
		it("throws ValidationError for a non-string tenantId, with zero repository calls", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				tenantId: 12345,
			} as unknown as RecordSpatialObservationCommand;

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toEqual(new ValidationError("tenantId must not be empty"));
			expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
		});

		it("throws ValidationError for a non-string hazardousEventId, with zero repository calls", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				hazardousEventId: null,
			} as unknown as RecordSpatialObservationCommand;

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toEqual(
				new ValidationError("hazardousEventId must not be empty"),
			);
			expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
		});
	});

	describe("tenant-membership gate", () => {
		it("propagates NotFoundError for a missing hazardousEventId with zero spatial reads/writes", async () => {
			const harness = createHarness({ events: [] });
			const command = makeCommand({ hazardousEventId: "missing-he" });

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(NotFoundError);
			expect((error as Error).message).toBe("HazardousEvent not found");
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toHaveLength(0);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toHaveLength(
				0,
			);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("propagates NotFoundError identically for a cross-tenant hazardousEventId", async () => {
			const harness = createHarness({
				events: [makeHazardousEvent({ id: "he-1", tenantId: "tenant-2" })],
			});
			const command = makeCommand({
				hazardousEventId: "he-1",
				tenantId: "tenant-1",
			});

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(NotFoundError);
			expect((error as Error).message).toBe("HazardousEvent not found");
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toHaveLength(0);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toHaveLength(
				0,
			);
		});
	});

	describe("observationTime defaulting and shape validation", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("defaults omitted observationTime to a single internally-computed now", async () => {
			const fixedNow = new Date("2026-03-01T10:00:00.000Z");
			vi.setSystemTime(fixedNow);
			const harness = createHarness();
			const command = makeCommand();
			expect(command.observationTime).toBeUndefined();

			const dto = await harness.useCase.execute(command);

			expect(dto.observationTime).toBe(fixedNow.toISOString());
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls[0]
					.observation.observationTime,
			).toEqual(fixedNow);
		});

		it("rejects a non-Date observationTime with ValidationError before any repository read that uses it", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				observationTime: "2026-01-01",
			} as unknown as RecordSpatialObservationCommand;

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect((error as Error).message).toBe(
				"observationTime must be a valid Date",
			);
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toHaveLength(0);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toHaveLength(
				0,
			);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("rejects an explicit null observationTime with ValidationError rather than defaulting it to now", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				observationTime: null,
			} as unknown as RecordSpatialObservationCommand;

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect((error as Error).message).toBe(
				"observationTime must be a valid Date",
			);
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toHaveLength(0);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toHaveLength(
				0,
			);
		});

		it("rejects a NaN-time Date observationTime with ValidationError before any repository read that uses it", async () => {
			const harness = createHarness();
			const command = makeCommand({
				observationTime: new Date(NaN),
			});

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect((error as Error).message).toBe(
				"observationTime must be a valid Date",
			);
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toHaveLength(0);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toHaveLength(
				0,
			);
		});
	});

	describe("duplicate-observationTime conflict handling", () => {
		it.each([undefined, true, false])(
			"succeeds when no existing observation exists at this exact time, regardless of confirmReplace=%s",
			async (confirmReplace) => {
				const harness = createHarness();
				const command = makeCommand({
					observationTime: new Date("2026-02-01T00:00:00.000Z"),
					confirmReplace,
				});

				const dto = await harness.useCase.execute(command);

				expect(dto.id).toBeTruthy();
				expect(
					harness.hazardousEventRepository.saveSpatialObservationCalls,
				).toHaveLength(1);
			},
		);

		it("propagates ConflictError with the exact message and performs zero saveSpatialObservation calls when confirmReplace is omitted", async () => {
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const harness = createHarness();
			harness.hazardousEventRepository.seedSpatialObservation(
				"he-1",
				makeSpatialObservationRecord({ observationTime }),
			);
			const command = makeCommand({ observationTime });

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ConflictError);
			expect((error as Error).message).toBe(
				`An observation already exists for hazardousEventId he-1 at observationTime ${observationTime.toISOString()}; pass confirmReplace to replace it`,
			);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("surfaces ValidationError for a malformed divisionIds even when observationTime is also a duplicate, with zero saveSpatialObservation calls", async () => {
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const harness = createHarness();
			harness.hazardousEventRepository.seedSpatialObservation(
				"he-1",
				makeSpatialObservationRecord({ observationTime }),
			);
			const command = makeCommand({
				observationTime,
				divisionIds: ["div-not-valid"],
			});

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});

		it("propagates ConflictError when confirmReplace is explicitly false", async () => {
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const harness = createHarness();
			harness.hazardousEventRepository.seedSpatialObservation(
				"he-1",
				makeSpatialObservationRecord({ observationTime }),
			);
			const command = makeCommand({ observationTime, confirmReplace: false });

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ConflictError,
			);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});

		it('treats a non-boolean truthy confirmReplace (the string "true") identically to omitted, and still conflicts', async () => {
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const harness = createHarness();
			harness.hazardousEventRepository.seedSpatialObservation(
				"he-1",
				makeSpatialObservationRecord({ observationTime }),
			);
			const command = {
				...makeCommand({ observationTime }),
				confirmReplace: "true",
			} as unknown as RecordSpatialObservationCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ConflictError,
			);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});

		describe("confirmReplace: true", () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it("reuses the existing observation's id/createdAt, sets a fresh updatedAt, and fully replaces (not merges) geometries/divisionIds/note", async () => {
				const observationTime = new Date("2026-02-01T00:00:00.000Z");
				const fixedNow = new Date("2026-03-01T10:00:00.000Z");
				vi.setSystemTime(fixedNow);
				const harness = createHarness({
					validDivisionIds: new Set(["div-new"]),
				});
				const existing = makeSpatialObservationRecord({
					observationTime,
					id: "observation-existing",
					createdAt: new Date("2026-01-01T12:00:00.000Z"),
					note: "prior note",
					geometries: [{ type: "Point", coordinates: [0, 0] }],
					divisionIds: ["div-existing"],
				});
				harness.hazardousEventRepository.seedSpatialObservation(
					"he-1",
					existing,
				);
				const command = makeCommand({
					observationTime,
					confirmReplace: true,
					note: "replacement note",
					geometries: [{ type: "Point", coordinates: [9, 9] }],
					divisionIds: ["div-new"],
				});

				const dto = await harness.useCase.execute(command);

				const savedArg =
					harness.hazardousEventRepository.saveSpatialObservationCalls[0]
						.observation;
				expect(savedArg.id).toBe("observation-existing");
				expect(savedArg.createdAt).toEqual(
					new Date("2026-01-01T12:00:00.000Z"),
				);
				expect(savedArg.updatedAt).toEqual(fixedNow);
				expect(savedArg.note).toBe("replacement note");
				expect(savedArg.geometries).toEqual([
					{ type: "Point", coordinates: [9, 9] },
				]);
				expect(savedArg.divisionIds).toEqual(["div-new"]);

				// updatedAt is the fake's +1s "enriched on write" value -- confirms the DTO
				// comes from save()'s return, not the pre-save entity.
				expect(dto.updatedAt).toBe(
					new Date(fixedNow.getTime() + 1000).toISOString(),
				);
				expect(dto.id).toBe("observation-existing");
			});

			it("does not carry the prior observation's note forward when the replace omits note", async () => {
				const observationTime = new Date("2026-02-01T00:00:00.000Z");
				const harness = createHarness();
				harness.hazardousEventRepository.seedSpatialObservation(
					"he-1",
					makeSpatialObservationRecord({
						observationTime,
						note: "prior note that must not survive",
					}),
				);
				const command = makeCommand({ observationTime, confirmReplace: true });
				expect(command.note).toBeUndefined();

				const dto = await harness.useCase.execute(command);

				expect(dto.note).toBeNull();
				expect(
					harness.hazardousEventRepository.saveSpatialObservationCalls[0]
						.observation.note,
				).toBeNull();
			});

			it("persists a caller-supplied non-null note on a replace", async () => {
				const observationTime = new Date("2026-02-01T00:00:00.000Z");
				const harness = createHarness();
				harness.hazardousEventRepository.seedSpatialObservation(
					"he-1",
					makeSpatialObservationRecord({ observationTime, note: "prior" }),
				);
				const command = makeCommand({
					observationTime,
					confirmReplace: true,
					note: "brand new note",
				});

				const dto = await harness.useCase.execute(command);

				expect(dto.note).toBe("brand new note");
			});
		});

		describe("concurrent callers racing for the same, previously-empty observationTime slot", () => {
			it("propagates the losing caller's saveSpatialObservation rejection unmodified rather than treating it as success", async () => {
				const observationTime = new Date("2026-02-01T00:00:00.000Z");
				const harness = createHarness();
				// Forces both readers' findSpatialObservationByTime to resolve null
				// deterministically (Decision 6).
				harness.hazardousEventRepository.findSpatialObservationByTimeOverride =
					null;
				harness.hazardousEventRepository.simulateUniqueConstraint = true;
				const commandA = makeCommand({ observationTime });
				const commandB = makeCommand({ observationTime });

				const results = await Promise.allSettled([
					harness.useCase.execute(commandA),
					harness.useCase.execute(commandB),
				]);

				const fulfilled = results.filter((r) => r.status === "fulfilled");
				const rejected = results.filter((r) => r.status === "rejected");
				expect(fulfilled).toHaveLength(1);
				expect(rejected).toHaveLength(1);
				expect(
					harness.hazardousEventRepository.saveSpatialObservationCalls,
				).toHaveLength(2);
				// Identity check, not just instanceof/message -- proves the exact error the fake
				// threw reaches the caller unmodified, not caught/rewrapped/swallowed.
				const rejectedResult = rejected[0] as PromiseRejectedResult;
				expect(rejectedResult.reason).toBe(
					harness.hazardousEventRepository.thrownConflictErrors[0],
				);
			});
		});
	});

	describe("divisionIds validation", () => {
		it("propagates ValidationError for a cross-tenant or non-existent division id with zero saveSpatialObservation calls", async () => {
			const harness = createHarness({ validDivisionIds: new Set(["div-1"]) });
			const command = makeCommand({ divisionIds: ["div-other-tenant"] });

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect((error as Error).message).toBe(
				"divisionId div-other-tenant is not present in validDivisionIds",
			);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});

		it("succeeds when every divisionIds entry is present under command.tenantId", async () => {
			const harness = createHarness({
				validDivisionIds: new Set(["div-1", "div-2"]),
			});
			const command = makeCommand({ divisionIds: ["div-1", "div-2"] });

			const dto = await harness.useCase.execute(command);

			expect(dto.divisionIds).toEqual(["div-1", "div-2"]);
		});

		it("survives a non-array divisionIds without a raw TypeError, surfacing SpatialObservation.create()'s own ValidationError, and queries the division repository with an empty id list", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				divisionIds: "not-an-array",
			} as unknown as RecordSpatialObservationCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toEqual([
				{ ids: [], tenantId: "tenant-1" },
			]);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});

		it("passes only well-typed string ids to the division repository query when divisionIds contains a non-string element", async () => {
			const harness = createHarness({ validDivisionIds: new Set(["div-1"]) });
			const command = {
				...makeCommand(),
				divisionIds: ["div-1", 42, "div-2"],
			} as unknown as RecordSpatialObservationCommand;

			await expect(harness.useCase.execute(command)).rejects.toThrow(
				ValidationError,
			);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toEqual([
				{ ids: ["div-1", "div-2"], tenantId: "tenant-1" },
			]);
		});
	});

	describe("geometries pass-through", () => {
		it("survives a non-array geometries without a raw TypeError, surfacing SpatialObservation.create()'s own ValidationError, with zero saveSpatialObservation calls", async () => {
			const harness = createHarness();
			const command = {
				...makeCommand(),
				geometries: "not-an-array",
			} as unknown as RecordSpatialObservationCommand;

			const error = await captureRejection(harness.useCase.execute(command));

			expect(error).toBeInstanceOf(ValidationError);
			expect((error as Error).message).toBe("geometries must be an array");
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls,
			).toHaveLength(0);
		});
	});

	describe("successful record persistence", () => {
		it("generates a fresh, non-deterministic id per fresh insert and pins createdAt to the internally-computed now", async () => {
			const fixedNow = new Date("2026-04-01T00:00:00.000Z");
			vi.useFakeTimers();
			vi.setSystemTime(fixedNow);
			try {
				const harnessA = createHarness();
				const harnessB = createHarness();
				const commandA = makeCommand({
					observationTime: new Date("2026-05-01T00:00:00.000Z"),
				});
				const commandB = makeCommand({
					observationTime: new Date("2026-06-01T00:00:00.000Z"),
				});

				await harnessA.useCase.execute(commandA);
				await harnessB.useCase.execute(commandB);

				const saveArgA =
					harnessA.hazardousEventRepository.saveSpatialObservationCalls[0]
						.observation;
				const saveArgB =
					harnessB.hazardousEventRepository.saveSpatialObservationCalls[0]
						.observation;

				// Two independent fresh inserts must not share an id -- catches a fallback that
				// silently became a hardcoded string instead of crypto.randomUUID().
				expect(saveArgA.id).not.toBe(saveArgB.id);
				expect(saveArgA.createdAt).toEqual(fixedNow);
				expect(saveArgB.createdAt).toEqual(fixedNow);
			} finally {
				vi.useRealTimers();
			}
		});

		it("forwards command.tenantId, unchanged, to every port call this use case makes", async () => {
			const harness = createHarness({
				events: [makeHazardousEvent({ id: "he-9", tenantId: "tenant-9" })],
				validDivisionIds: new Set(["div-9"]),
			});
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const command = makeCommand({
				tenantId: "tenant-9",
				hazardousEventId: "he-9",
				observationTime,
				divisionIds: ["div-9"],
			});

			await harness.useCase.execute(command);

			expect(harness.hazardousEventRepository.findByIdCalls).toEqual([
				{ id: "he-9", tenantId: "tenant-9" },
			]);
			expect(harness.divisionRepository.findValidDivisionIdsCalls).toEqual([
				{ ids: ["div-9"], tenantId: "tenant-9" },
			]);
			expect(
				harness.hazardousEventRepository.findSpatialObservationByTimeCalls,
			).toEqual([
				{ hazardousEventId: "he-9", observationTime, tenantId: "tenant-9" },
			]);
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls[0]
					.hazardousEventId,
			).toBe("he-9");
			expect(
				harness.hazardousEventRepository.saveSpatialObservationCalls[0]
					.tenantId,
			).toBe("tenant-9");
		});

		it("returns a SpatialObservationDto with ISO date strings reflecting saveSpatialObservation()'s resolved values", async () => {
			const harness = createHarness({ validDivisionIds: new Set(["div-1"]) });
			const command = makeCommand({
				observationTime: new Date("2026-02-01T00:00:00.000Z"),
				divisionIds: ["div-1"],
				note: "a note",
				geometries: [{ type: "Point", coordinates: [3, 3] }],
			});

			const dto = await harness.useCase.execute(command);

			expect(dto.hazardousEventId).toBe("he-1");
			expect(dto.note).toBe("a note");
			expect(dto.geometries).toEqual([{ type: "Point", coordinates: [3, 3] }]);
			expect(dto.divisionIds).toEqual(["div-1"]);
			expect(dto.observationTime).toBe("2026-02-01T00:00:00.000Z");
			const saveArg =
				harness.hazardousEventRepository.saveSpatialObservationCalls[0]
					.observation;
			expect(dto.createdAt).toBe(saveArg.createdAt.toISOString());
			// updatedAt is the fake's +1s "enriched on write" value -- confirms the DTO
			// comes from save()'s return, not the pre-save entity.
			expect(dto.updatedAt).toBe(
				new Date(saveArg.updatedAt.getTime() + 1000).toISOString(),
			);
		});

		it("logs spatial_observation.recorded with replaced: false on a fresh insert", async () => {
			const harness = createHarness();
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const command = makeCommand({ observationTime });

			await harness.useCase.execute(command);

			expect(harness.logger.info).toHaveBeenCalledTimes(1);
			expect(harness.logger.info).toHaveBeenCalledWith({
				msg: "spatial_observation.recorded",
				hazardousEventId: "he-1",
				tenantId: "tenant-1",
				observationTime: observationTime.toISOString(),
				replaced: false,
			});
		});

		it("logs spatial_observation.recorded with replaced: true on a replace", async () => {
			const observationTime = new Date("2026-02-01T00:00:00.000Z");
			const harness = createHarness();
			harness.hazardousEventRepository.seedSpatialObservation(
				"he-1",
				makeSpatialObservationRecord({ observationTime }),
			);
			const command = makeCommand({ observationTime, confirmReplace: true });

			await harness.useCase.execute(command);

			expect(harness.logger.info).toHaveBeenCalledTimes(1);
			expect(harness.logger.info).toHaveBeenCalledWith({
				msg: "spatial_observation.recorded",
				hazardousEventId: "he-1",
				tenantId: "tenant-1",
				observationTime: observationTime.toISOString(),
				replaced: true,
			});
		});
	});
});
