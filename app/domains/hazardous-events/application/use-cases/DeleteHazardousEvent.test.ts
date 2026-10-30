import { describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import type { CausalEdge } from "../../domain/CausalChain";
import type { Tx } from "~/db.server";
import { ConflictError, NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import type { ITransactionRunner } from "~/shared/persistence/ITransactionRunner";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/event-causality/application/ports/IEventCausalityRepository";
import type { EntityType } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import { DeleteWorkflowInstanceUseCase } from "~/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance";
import {
	DeleteHazardousEventUseCase,
	type DeleteHazardousEventCommand,
} from "./DeleteHazardousEvent";

/** No real transaction semantics — just invokes fn with a placeholder tx, matching this
 * codebase's own inline-fake convention for every other port these use cases fake. */
const fakeTx = {} as Tx;

class FakeTransactionRunner implements ITransactionRunner {
	runCalls = 0;

	async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
		this.runCalls += 1;
		return fn(fakeTx);
	}
}

async function captureThrown(fn: () => Promise<unknown>): Promise<unknown> {
	try {
		await fn();
	} catch (error) {
		return error;
	}
	throw new Error("expected fn() to throw, but it resolved");
}

class FakeLogger implements ILogger {
	info = vi.fn();
	warn = vi.fn();
	error = vi.fn();
	debug = vi.fn();
}

type NumberResult = number | Error;
type CountsResult = EventCausalityReferenceCounts | Error;

class FakeHazardousEventRepository implements IHazardousEventRepository {
	readonly findByIdCalls: { id: string; tenantId: string }[] = [];
	readonly findByIdForUpdateCalls: {
		id: string;
		tenantId: string;
		tx?: Tx;
	}[] = [];
	readonly deleteCalls: { id: string; tenantId: string; tx?: Tx }[] = [];
	readonly countReferencingDisasterEventsCalls: {
		id: string;
		tenantId: string;
		tx?: Tx;
	}[] = [];
	private readonly disasterEventCounts = new Map<string, NumberResult>();
	private readonly store = new Map<string, HazardousEvent>();
	findByIdBehavior: Error | undefined;
	/** Default: the same lookup findById uses. Override to simulate the post-findById race a
	 * concurrent delete creates (design.md Decision 8, Task 8.2). */
	findByIdForUpdateBehavior: Error | undefined;

	constructor(
		seed: readonly HazardousEvent[] = [],
		private readonly callLog: string[] = [],
	) {
		for (const entity of seed) {
			this.store.set(this.key(entity.id, entity.tenantId), entity);
		}
	}

	private key(id: string, tenantId: string): string {
		return `${tenantId}:${id}`;
	}

	setDisasterEventCount(hazardousEventId: string, result: NumberResult): void {
		this.disasterEventCounts.set(hazardousEventId, result);
	}

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		this.findByIdCalls.push({ id, tenantId });
		if (this.findByIdBehavior) {
			throw this.findByIdBehavior;
		}
		const found = this.store.get(this.key(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async countReferencingDisasterEvents(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<number> {
		this.countReferencingDisasterEventsCalls.push({
			id: hazardousEventId,
			tenantId,
			tx,
		});
		const result = this.disasterEventCounts.get(hazardousEventId) ?? 0;
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	async findByIdForUpdate(
		id: string,
		tenantId: string,
		tx: Tx,
	): Promise<HazardousEvent> {
		this.findByIdForUpdateCalls.push({ id, tenantId, tx });
		if (this.findByIdForUpdateBehavior) {
			throw this.findByIdForUpdateBehavior;
		}
		const found = this.store.get(this.key(id, tenantId));
		if (!found) {
			throw new NotFoundError("HazardousEvent", id);
		}
		return found;
	}

	async delete(id: string, tenantId: string, tx?: Tx): Promise<void> {
		this.deleteCalls.push({ id, tenantId, tx });
		this.callLog.push("hazardousEvent.delete");
		this.store.delete(this.key(id, tenantId));
	}

	async findAll(): Promise<HazardousEvent[]> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async countAll(): Promise<number> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async insert(): Promise<HazardousEvent> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async update(): Promise<HazardousEvent> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async findCurrentSpatialObservation(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async findSpatialObservationByTime(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async saveSpatialObservation(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}
}

class FakeEventCausalityRepository implements IEventCausalityRepository {
	readonly countReferencesCalls: {
		id: string;
		tenantId: string;
		tx?: Tx;
	}[] = [];
	private readonly results = new Map<string, CountsResult>();

	setResult(hazardousEventId: string, result: CountsResult): void {
		this.results.set(hazardousEventId, result);
	}

	async countReferences(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<EventCausalityReferenceCounts> {
		this.countReferencesCalls.push({ id: hazardousEventId, tenantId, tx });
		const result = this.results.get(hazardousEventId) ?? {
			sameTenantCount: 0,
			crossTenantCount: 0,
		};
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}
}

class FakeCausalChainRepository implements ICausalChainRepository {
	readonly countEdgesTouchingCalls: string[] = [];
	readonly countEdgesTouchingTxCalls: (Tx | undefined)[] = [];
	private readonly results = new Map<string, NumberResult>();

	setCount(nodeId: string, result: NumberResult): void {
		this.results.set(nodeId, result);
	}

	async countEdgesTouching(nodeId: string, tx?: Tx): Promise<number> {
		this.countEdgesTouchingCalls.push(nodeId);
		this.countEdgesTouchingTxCalls.push(tx);
		const result = this.results.get(nodeId) ?? 0;
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	async findReachableEdgesFrom(): Promise<readonly CausalEdge[]> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async saveEdge(): Promise<void> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async replaceCauseEdge(): Promise<void> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}
}

/** `concurrentBarrierSize` gates deleteByEntity, the use case's first write -- both calls' own findById/dependent-checks must already be done by the time either reaches it. */
class FakeWorkflowRepository implements IWorkflowRepository {
	readonly deleteByEntityCalls: {
		entityId: string;
		entityType: EntityType;
		tx?: Tx;
	}[] = [];
	deleteByEntityBehavior: "succeed" | Error = "succeed";
	concurrentBarrierSize = 0;
	private readonly barrierResolvers: (() => void)[] = [];

	constructor(private readonly callLog: string[] = []) {}

	async deleteByEntity(
		entityId: string,
		entityType: EntityType,
		tx?: Tx,
	): Promise<void> {
		this.deleteByEntityCalls.push({ entityId, entityType, tx });
		if (this.concurrentBarrierSize > 0) {
			await this.awaitBarrier();
		}
		if (this.deleteByEntityBehavior instanceof Error) {
			throw this.deleteByEntityBehavior;
		}
		this.callLog.push("workflow.deleteByEntity");
	}

	private awaitBarrier(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.barrierResolvers.push(resolve);
			if (this.barrierResolvers.length >= this.concurrentBarrierSize) {
				const resolvers = this.barrierResolvers.splice(0);
				for (const resolver of resolvers) resolver();
			}
		});
	}

	async findByEntity(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async findByEntityIds(): Promise<never[]> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async insert(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async update(): Promise<never> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}
}

const baseEventProps: HazardousEventProps = {
	id: "event-A",
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

function makeEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseEventProps, ...overrides },
		new Set(),
		new Set(),
	);
}

function makeCommand(
	overrides: Partial<DeleteHazardousEventCommand> & {
		id: string;
		tenantId: string;
	},
): DeleteHazardousEventCommand {
	return { actingUserId: "user-1", ...overrides };
}

function createHarness() {
	const callLog: string[] = [];
	const logger = new FakeLogger();
	const hazardousEventRepository = new FakeHazardousEventRepository(
		[makeEvent()],
		callLog,
	);
	const eventCausalityRepository = new FakeEventCausalityRepository();
	const causalChainRepository = new FakeCausalChainRepository();
	const workflowRepository = new FakeWorkflowRepository(callLog);
	const transactionRunner = new FakeTransactionRunner();
	const useCase = new DeleteHazardousEventUseCase(
		logger,
		hazardousEventRepository,
		eventCausalityRepository,
		causalChainRepository,
		new DeleteWorkflowInstanceUseCase(workflowRepository),
		transactionRunner,
	);
	return {
		callLog,
		logger,
		hazardousEventRepository,
		eventCausalityRepository,
		causalChainRepository,
		workflowRepository,
		transactionRunner,
		useCase,
	};
}

describe("DeleteHazardousEventUseCase", () => {
	it("deletes successfully when all three dependent checks resolve zero", async () => {
		const harness = createHarness();

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).resolves.toBeUndefined();

		expect(harness.workflowRepository.deleteByEntityCalls).toEqual([
			{ entityId: "event-A", entityType: "HE", tx: fakeTx },
		]);
		expect(harness.hazardousEventRepository.deleteCalls).toEqual([
			{ id: "event-A", tenantId: "tenant-1", tx: fakeTx },
		]);
	});

	it("propagates NotFoundError from findById, calling no dependent check, deleteByEntity, or delete", async () => {
		const harness = createHarness();

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "missing-event", tenantId: "tenant-1" }),
			),
		).rejects.toThrow(NotFoundError);

		expect(
			harness.hazardousEventRepository.countReferencingDisasterEventsCalls,
		).toHaveLength(0);
		expect(harness.eventCausalityRepository.countReferencesCalls).toHaveLength(
			0,
		);
		expect(harness.causalChainRepository.countEdgesTouchingCalls).toHaveLength(
			0,
		);
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		expect(
			harness.hazardousEventRepository.findByIdForUpdateCalls,
		).toHaveLength(0);
		expect(harness.transactionRunner.runCalls).toBe(0);
	});

	it("propagates NotFoundError for an existing event looked up under a different tenantId, calling no dependent check", async () => {
		const harness = createHarness();

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-2" }),
			),
		).rejects.toThrow(NotFoundError);

		expect(
			harness.hazardousEventRepository.countReferencingDisasterEventsCalls,
		).toHaveLength(0);
		expect(
			harness.hazardousEventRepository.findByIdForUpdateCalls,
		).toHaveLength(0);
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
	});

	it("propagates a generic (non-NotFoundError) rejection from findById unmodified, calling no dependent check", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.findByIdBehavior = new Error(
			"boom-find-by-id",
		);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-find-by-id");
		expect(
			harness.hazardousEventRepository.countReferencingDisasterEventsCalls,
		).toHaveLength(0);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	it("propagates a generic rejection from countReferencingDisasterEvents, calling neither deleteByEntity nor delete", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.setDisasterEventCount(
			"event-A",
			new Error("boom-disaster-event-count"),
		);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-disaster-event-count");
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
	});

	it("propagates a generic rejection from IEventCausalityRepository.countReferences, calling neither deleteByEntity nor delete", async () => {
		const harness = createHarness();
		harness.eventCausalityRepository.setResult(
			"event-A",
			new Error("boom-event-causality-count"),
		);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-event-causality-count");
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
	});

	describe("command validation", () => {
		it.each([
			["id", { id: "", tenantId: "tenant-1" }],
			["tenantId", { id: "event-A", tenantId: "" }],
			[
				"actingUserId",
				{ id: "event-A", tenantId: "tenant-1", actingUserId: "" },
			],
		])(
			"throws ValidationError for an empty-string %s, with zero repository calls",
			async (fieldName, overrides) => {
				const harness = createHarness();

				await expect(
					harness.useCase.execute(makeCommand(overrides)),
				).rejects.toThrow(
					new ValidationError(`${fieldName} must not be empty`),
				);
				expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
				expect(harness.logger.info).not.toHaveBeenCalled();
			},
		);

		it.each([
			["id", { id: 12345, tenantId: "tenant-1" }],
			["tenantId", { id: "event-A", tenantId: 12345 }],
			[
				"actingUserId",
				{ id: "event-A", tenantId: "tenant-1", actingUserId: 12345 },
			],
		])(
			"throws ValidationError for a non-string %s, with zero repository calls",
			async (fieldName, overrides) => {
				const harness = createHarness();
				const command = makeCommand(
					overrides as unknown as DeleteHazardousEventCommand,
				);

				await expect(harness.useCase.execute(command)).rejects.toThrow(
					new ValidationError(`${fieldName} must not be empty`),
				);
				expect(harness.hazardousEventRepository.findByIdCalls).toHaveLength(0);
				expect(harness.logger.info).not.toHaveBeenCalled();
			},
		);
	});

	describe("DISASTER_EVENT dependent", () => {
		it("blocks the delete, naming the exact count, calling neither deleteByEntity nor delete", async () => {
			const harness = createHarness();
			harness.hazardousEventRepository.setDisasterEventCount("event-A", 1);

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [{ type: "DISASTER_EVENT", count: 1 }],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});
	});

	describe("EVENT_CAUSALITY dependent", () => {
		it("a same-tenant-only reference discloses its count and flags no cross-tenant reference", async () => {
			const harness = createHarness();
			harness.eventCausalityRepository.setResult("event-A", {
				sameTenantCount: 1,
				crossTenantCount: 0,
			});

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [
					{
						type: "EVENT_CAUSALITY",
						count: 1,
						crossTenantReferenceExists: false,
					},
				],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});

		it("a cross-tenant-only reference blocks the delete, discloses a zero count and a true flag, never the cross-tenant count itself", async () => {
			const harness = createHarness();
			harness.eventCausalityRepository.setResult("event-A", {
				sameTenantCount: 0,
				crossTenantCount: 1,
			});

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			// toEqual rejects any extra key, so this also proves crossTenantCount (1) is absent.
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [
					{
						type: "EVENT_CAUSALITY",
						count: 0,
						crossTenantReferenceExists: true,
					},
				],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});

		it("both same-tenant and cross-tenant references present: discloses the same-tenant count only", async () => {
			const harness = createHarness();
			harness.eventCausalityRepository.setResult("event-A", {
				sameTenantCount: 2,
				crossTenantCount: 3,
			});

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [
					{
						type: "EVENT_CAUSALITY",
						count: 2,
						crossTenantReferenceExists: true,
					},
				],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});
	});

	describe("CAUSAL_CHAIN dependent", () => {
		it("blocks the delete when the event is the cause side of an edge", async () => {
			const harness = createHarness();
			harness.causalChainRepository.setCount("event-A", 1);

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [{ type: "CAUSAL_CHAIN", count: 1 }],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});

		it("blocks the delete when the event is only the effect side of an edge, with no outgoing edge of its own", async () => {
			const harness = createHarness();
			harness.causalChainRepository.setCount("event-A", 1);

			const thrown = await captureThrown(() =>
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			);

			expect(thrown).toBeInstanceOf(ConflictError);
			expect((thrown as ConflictError).context).toEqual({
				hazardousEventId: "event-A",
				dependents: [{ type: "CAUSAL_CHAIN", count: 1 }],
			});
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		});
	});

	it("names command.id as context.hazardousEventId and emits exactly one dependents entry for a single blocking source", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.setDisasterEventCount("event-A", 1);

		const thrown = await captureThrown(() =>
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		);

		const context = (thrown as ConflictError).context as {
			hazardousEventId: string;
			dependents: unknown[];
		};
		expect(context.hazardousEventId).toBe("event-A");
		expect(context.dependents).toHaveLength(1);
	});

	it("pins the exact ConflictError message", async () => {
		const harness = createHarness();
		harness.causalChainRepository.setCount("event-A", 1);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("Cannot delete a hazardous event that has dependents");
	});

	it("runs all three dependent checks before throwing, naming every blocking source in one ConflictError", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.setDisasterEventCount("event-A", 2);
		harness.causalChainRepository.setCount("event-A", 1);

		const thrown = await captureThrown(() =>
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		);

		expect(
			harness.hazardousEventRepository.countReferencingDisasterEventsCalls,
		).toHaveLength(1);
		expect(harness.eventCausalityRepository.countReferencesCalls).toHaveLength(
			1,
		);
		expect(harness.causalChainRepository.countEdgesTouchingCalls).toHaveLength(
			1,
		);
		expect(thrown).toBeInstanceOf(ConflictError);
		const context = (thrown as ConflictError).context as {
			dependents: { type: string }[];
		};
		expect(context.dependents).toEqual(
			expect.arrayContaining([
				{ type: "DISASTER_EVENT", count: 2 },
				{ type: "CAUSAL_CHAIN", count: 1 },
			]),
		);
		expect(context.dependents).toHaveLength(2);
		expect(
			context.dependents.some(
				(dependent) => dependent.type === "EVENT_CAUSALITY",
			),
		).toBe(false);
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
	});

	it("propagates a generic Error from a dependent-reference check rejecting, calling neither deleteByEntity nor delete", async () => {
		const harness = createHarness();
		harness.causalChainRepository.setCount(
			"event-A",
			new Error("boom-count-edges"),
		);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-count-edges");
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	it("calls deleteByEntity before delete, in that order, when all checks pass", async () => {
		const harness = createHarness();

		await harness.useCase.execute(
			makeCommand({ id: "event-A", tenantId: "tenant-1" }),
		);

		expect(harness.callLog).toEqual([
			"workflow.deleteByEntity",
			"hazardousEvent.delete",
		]);
	});

	it("propagates a rejection from deleteByEntity, never reaching delete, with no log event", async () => {
		const harness = createHarness();
		harness.workflowRepository.deleteByEntityBehavior = new Error(
			"boom-delete-by-entity",
		);

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-delete-by-entity");
		expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	it("propagates a rejection from delete after deleteByEntity already succeeded, with no log event", async () => {
		const harness = createHarness();
		harness.hazardousEventRepository.delete = async () => {
			throw new Error("boom-hazardous-event-delete");
		};

		await expect(
			harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			),
		).rejects.toThrow("boom-hazardous-event-delete");
		expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(1);
		expect(harness.logger.info).not.toHaveBeenCalled();
	});

	describe("logging", () => {
		it("logs hazardous_event.deleted exactly once on success, naming id/tenantId/actingUserId", async () => {
			const harness = createHarness();

			await harness.useCase.execute(
				makeCommand({
					id: "event-A",
					tenantId: "tenant-1",
					actingUserId: "user-7",
				}),
			);

			expect(harness.logger.info).toHaveBeenCalledTimes(1);
			expect(harness.logger.info).toHaveBeenCalledWith({
				msg: "hazardous_event.deleted",
				hazardousEventId: "event-A",
				tenantId: "tenant-1",
				actingUserId: "user-7",
			});
		});

		it("emits no log event when blocked by a ConflictError", async () => {
			const harness = createHarness();
			harness.causalChainRepository.setCount("event-A", 1);

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			).rejects.toThrow(ConflictError);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("emits no log event when findById throws NotFoundError", async () => {
			const harness = createHarness();

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "missing-event", tenantId: "tenant-1" }),
				),
			).rejects.toThrow(NotFoundError);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});
	});

	describe("transaction wrapping (design.md Decision 1 — ITransactionRunner)", () => {
		it("calls transactionRunner.run exactly once, passing the same tx to findByIdForUpdate, all three counts, deleteByEntity, and delete", async () => {
			const harness = createHarness();

			await harness.useCase.execute(
				makeCommand({ id: "event-A", tenantId: "tenant-1" }),
			);

			expect(harness.transactionRunner.runCalls).toBe(1);
			expect(
				harness.hazardousEventRepository.findByIdForUpdateCalls[0].tx,
			).toBe(fakeTx);
			expect(
				harness.hazardousEventRepository.countReferencingDisasterEventsCalls[0]
					.tx,
			).toBe(fakeTx);
			expect(harness.eventCausalityRepository.countReferencesCalls[0].tx).toBe(
				fakeTx,
			);
			expect(harness.causalChainRepository.countEdgesTouchingTxCalls[0]).toBe(
				fakeTx,
			);
			expect(harness.workflowRepository.deleteByEntityCalls[0].tx).toBe(fakeTx);
			expect(harness.hazardousEventRepository.deleteCalls[0].tx).toBe(fakeTx);
		});

		it("a deleteByEntity rejection propagates unmodified, with no log event", async () => {
			const harness = createHarness();
			harness.workflowRepository.deleteByEntityBehavior = new Error(
				"boom-delete-by-entity",
			);

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			).rejects.toThrow("boom-delete-by-entity");
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});
	});

	describe("execute() treats a post-findById NotFoundError from findByIdForUpdate as a successful no-op", () => {
		it("resolves without throwing, running none of the dependent counts and neither delete call, with no log event", async () => {
			const harness = createHarness();
			harness.hazardousEventRepository.findByIdForUpdateBehavior =
				new NotFoundError("HazardousEvent", "event-A");

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			).resolves.toBeUndefined();

			expect(
				harness.hazardousEventRepository.countReferencingDisasterEventsCalls,
			).toHaveLength(0);
			expect(
				harness.eventCausalityRepository.countReferencesCalls,
			).toHaveLength(0);
			expect(
				harness.causalChainRepository.countEdgesTouchingCalls,
			).toHaveLength(0);
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(0);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(0);
			expect(harness.logger.info).not.toHaveBeenCalled();
		});

		it("a ValidationError from the same findByIdForUpdate call still propagates unmodified, not caught", async () => {
			const harness = createHarness();
			const thrown = new ValidationError("malformed row");
			harness.hazardousEventRepository.findByIdForUpdateBehavior = thrown;

			await expect(
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			).rejects.toBe(thrown);
		});
	});

	describe("concurrent callers", () => {
		// This test moved: the no-op-catch path is unit-tested directly below ("treats a
		// post-findById NotFoundError ... as a successful no-op"); the real lock guarantee
		// (design.md Decision 8) needs a real lock, proven in Task 8.4's PGlite test, not a fake.

		it("concurrent callers for different tenants resolve independently, with no cross-contamination", async () => {
			const callLog: string[] = [];
			const logger = new FakeLogger();
			const eventT1 = makeEvent({ id: "event-T1", tenantId: "T1" });
			const eventT2 = makeEvent({ id: "event-T2", tenantId: "T2" });
			const hazardousEventRepository = new FakeHazardousEventRepository(
				[eventT1, eventT2],
				callLog,
			);
			const eventCausalityRepository = new FakeEventCausalityRepository();
			eventCausalityRepository.setResult("event-T2", {
				sameTenantCount: 1,
				crossTenantCount: 0,
			});
			const causalChainRepository = new FakeCausalChainRepository();
			const workflowRepository = new FakeWorkflowRepository(callLog);
			const useCase = new DeleteHazardousEventUseCase(
				logger,
				hazardousEventRepository,
				eventCausalityRepository,
				causalChainRepository,
				new DeleteWorkflowInstanceUseCase(workflowRepository),
				new FakeTransactionRunner(),
			);

			const results = await Promise.allSettled([
				useCase.execute(
					makeCommand({ id: "event-T1", tenantId: "T1", actingUserId: "u1" }),
				),
				useCase.execute(
					makeCommand({ id: "event-T2", tenantId: "T2", actingUserId: "u2" }),
				),
			]);

			const t2Rejection = results[1] as PromiseRejectedResult;
			expect(results[0].status).toBe("fulfilled");
			expect(results[1].status).toBe("rejected");
			expect(t2Rejection.reason).toBeInstanceOf(ConflictError);
			expect((t2Rejection.reason as ConflictError).context).toMatchObject({
				hazardousEventId: "event-T2",
			});
			expect(hazardousEventRepository.deleteCalls).toEqual([
				{ id: "event-T1", tenantId: "T1", tx: fakeTx },
			]);
			expect(workflowRepository.deleteByEntityCalls).toEqual([
				{ entityId: "event-T1", entityType: "HE", tx: fakeTx },
			]);
			expect(eventCausalityRepository.countReferencesCalls).toHaveLength(2);
			expect(eventCausalityRepository.countReferencesCalls).toEqual(
				expect.arrayContaining([
					{ id: "event-T1", tenantId: "T1", tx: fakeTx },
					{ id: "event-T2", tenantId: "T2", tx: fakeTx },
				]),
			);
		});
	});
});
