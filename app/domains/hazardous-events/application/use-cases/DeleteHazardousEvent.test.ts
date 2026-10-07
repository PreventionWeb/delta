import { describe, expect, it, vi } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import type { CausalEdge } from "../../domain/CausalChain";
import { ConflictError, NotFoundError, ValidationError } from "~/shared/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import type { IHazardousEventRepository } from "../ports/IHazardousEventRepository";
import type { ICausalChainRepository } from "../ports/ICausalChainRepository";
import type {
	EventCausalityReferenceCounts,
	IEventCausalityRepository,
} from "~/domains/shared/application/ports/IEventCausalityRepository";
import type { EntityType } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import {
	DeleteHazardousEventUseCase,
	type DeleteHazardousEventCommand,
} from "./DeleteHazardousEvent";

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
	readonly deleteCalls: { id: string; tenantId: string }[] = [];
	readonly countReferencingDisasterEventsCalls: {
		id: string;
		tenantId: string;
	}[] = [];
	private readonly disasterEventCounts = new Map<string, NumberResult>();
	private readonly store = new Map<string, HazardousEvent>();
	findByIdBehavior: Error | undefined;

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
	): Promise<number> {
		this.countReferencingDisasterEventsCalls.push({
			id: hazardousEventId,
			tenantId,
		});
		const result = this.disasterEventCounts.get(hazardousEventId) ?? 0;
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	async delete(id: string, tenantId: string): Promise<void> {
		this.deleteCalls.push({ id, tenantId });
		this.callLog.push("hazardousEvent.delete");
		this.store.delete(this.key(id, tenantId));
	}

	async findAll(): Promise<HazardousEvent[]> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}

	async save(): Promise<HazardousEvent> {
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
	readonly countReferencesCalls: { id: string; tenantId: string }[] = [];
	private readonly results = new Map<string, CountsResult>();

	setResult(hazardousEventId: string, result: CountsResult): void {
		this.results.set(hazardousEventId, result);
	}

	async countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts> {
		this.countReferencesCalls.push({ id: hazardousEventId, tenantId });
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
	private readonly results = new Map<string, NumberResult>();

	setCount(nodeId: string, result: NumberResult): void {
		this.results.set(nodeId, result);
	}

	async countEdgesTouching(nodeId: string): Promise<number> {
		this.countEdgesTouchingCalls.push(nodeId);
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

	async deleteCauseEdges(): Promise<void> {
		throw new Error("not used by DeleteHazardousEventUseCase's own tests");
	}
}

/** `concurrentBarrierSize` gates deleteByEntity, the use case's first write — both calls'
 * own findById/dependent-checks must already be done by the time either reaches it. */
class FakeWorkflowRepository implements IWorkflowRepository {
	readonly deleteByEntityCalls: { entityId: string; entityType: EntityType }[] =
		[];
	deleteByEntityBehavior: "succeed" | Error = "succeed";
	concurrentBarrierSize = 0;
	private readonly barrierResolvers: (() => void)[] = [];

	constructor(private readonly callLog: string[] = []) {}

	async deleteByEntity(
		entityId: string,
		entityType: EntityType,
	): Promise<void> {
		this.deleteByEntityCalls.push({ entityId, entityType });
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

	async save(): Promise<never> {
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
	const useCase = new DeleteHazardousEventUseCase(
		logger,
		hazardousEventRepository,
		eventCausalityRepository,
		causalChainRepository,
		workflowRepository,
	);
	return {
		callLog,
		logger,
		hazardousEventRepository,
		eventCausalityRepository,
		causalChainRepository,
		workflowRepository,
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
			{ entityId: "event-A", entityType: "HE" },
		]);
		expect(harness.hazardousEventRepository.deleteCalls).toEqual([
			{ id: "event-A", tenantId: "tenant-1" },
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

	describe("concurrent callers", () => {
		it("two concurrent deletes of the same zero-dependent event, both reads before either write, both succeed", async () => {
			const harness = createHarness();
			harness.workflowRepository.concurrentBarrierSize = 2;

			const results = await Promise.allSettled([
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
				harness.useCase.execute(
					makeCommand({ id: "event-A", tenantId: "tenant-1" }),
				),
			]);

			expect(results[0].status).toBe("fulfilled");
			expect(results[1].status).toBe("fulfilled");
			expect(harness.workflowRepository.deleteByEntityCalls).toHaveLength(2);
			expect(harness.hazardousEventRepository.deleteCalls).toHaveLength(2);
			expect(harness.logger.info).toHaveBeenCalledTimes(2);
			// Forced read-before-write ordering proves no shared state, not DB-level exclusion.
			await expect(
				harness.hazardousEventRepository.findById("event-A", "tenant-1"),
			).rejects.toThrow(NotFoundError);
		});

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
				workflowRepository,
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
				{ id: "event-T1", tenantId: "T1" },
			]);
			expect(workflowRepository.deleteByEntityCalls).toEqual([
				{ entityId: "event-T1", entityType: "HE" },
			]);
			expect(eventCausalityRepository.countReferencesCalls).toHaveLength(2);
			expect(eventCausalityRepository.countReferencesCalls).toEqual(
				expect.arrayContaining([
					{ id: "event-T1", tenantId: "T1" },
					{ id: "event-T2", tenantId: "T2" },
				]),
			);
		});
	});
});
