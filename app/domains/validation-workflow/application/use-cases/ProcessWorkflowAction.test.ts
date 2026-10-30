import { afterEach, describe, expect, it, vi } from "vitest";

import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { ConcurrentModificationError, ConflictError } from "~/shared/errors";

import {
	WorkflowInstance,
	type EntityType,
	type Status,
	type TransitionParams,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type {
	INotificationPort,
	WorkflowActionNotification,
} from "../ports/INotificationPort";
import { WorkflowInstanceNotFoundError } from "../errors/WorkflowInstanceErrors";

import { ProcessWorkflowActionUseCase } from "./ProcessWorkflowAction";
import type { ProcessWorkflowActionCommand } from "./ProcessWorkflowAction";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Per-test IWorkflowRepository double: `findByEntity` resolves the fixed
 * instance (or null); `update` echoes its argument unless a custom impl is given.
 * `insert` is never called by this use case — stubbed only to satisfy the interface. */
function makeRepository(
	instance: WorkflowInstance | null,
	updateImpl?: (
		instance: WorkflowInstance,
		expectedUpdatedAt: Date,
	) => Promise<WorkflowInstance>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn().mockResolvedValue(instance),
		findByEntityIds: vi.fn(),
		insert: vi.fn(),
		update: updateImpl
			? vi.fn().mockImplementation(updateImpl)
			: vi.fn().mockImplementation((i: WorkflowInstance) => Promise.resolve(i)),
		deleteByEntity: vi.fn(),
	};
}

/** Recording INotificationPort double. Defaults to a resolved no-op. */
function makeNotificationPort(
	notifyImpl?: (notification: WorkflowActionNotification) => Promise<void>,
): INotificationPort {
	return {
		notify: notifyImpl
			? vi.fn().mockImplementation(notifyImpl)
			: vi.fn().mockResolvedValue(undefined),
	};
}

/**
 * Attribution defaults per status, satisfying WorkflowInstance.create()'s
 * REQUIRED_SET/REQUIRED_NULL invariants so tests need not hand-roll them.
 */
function defaultAttributionForStatus(status: Status) {
	const submitted = {
		submittedByUserId: "submitter-1",
		submittedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
	const validated = {
		validatedByUserId: "validator-1",
		validatedAt: new Date("2026-01-02T00:00:00.000Z"),
	};
	const approved = {
		approvedByUserId: "approver-1",
		approvedAt: new Date("2026-01-03T00:00:00.000Z"),
	};
	const published = {
		publishedByUserId: "publisher-1",
		publishedAt: new Date("2026-01-04T00:00:00.000Z"),
	};
	const noneSubmitted = { submittedByUserId: null, submittedAt: null };
	const noneValidated = { validatedByUserId: null, validatedAt: null };
	const noneApproved = { approvedByUserId: null, approvedAt: null };
	const nonePublished = { publishedByUserId: null, publishedAt: null };

	switch (status) {
		case "DRAFT":
			return {
				...noneSubmitted,
				...noneValidated,
				...noneApproved,
				...nonePublished,
			};
		case "SUBMITTED":
		case "REVISION_REQUESTED":
			return {
				...submitted,
				...noneValidated,
				...noneApproved,
				...nonePublished,
			};
		case "APPROVED":
			return { ...submitted, ...noneValidated, ...approved, ...nonePublished };
		case "PUBLISHED":
			return { ...submitted, ...validated, ...approved, ...published };
		case "REJECTED":
			throw new Error("REJECTED is out of scope for this use case (DEF-022)");
	}
}

interface BuildInstanceOptions {
	id?: string;
	entityId?: string;
	entityType?: EntityType;
	status: Status;
	submittedByUserId?: string | null;
	submittedAt?: Date | null;
	validatedByUserId?: string | null;
	validatedAt?: Date | null;
	approvedByUserId?: string | null;
	approvedAt?: Date | null;
	publishedByUserId?: string | null;
	publishedAt?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
}

/** Checks `undefined` specifically (not `??`), so an explicit `null` override isn't confused
 * with "not passed" — lets a scenario force a field to `null` against its status default. */
function withDefault<T>(
	value: T | null | undefined,
	fallback: T | null,
): T | null {
	return value === undefined ? fallback : value;
}

/** Builds a valid WorkflowInstance at a given status, overriding only what a scenario needs. */
function buildInstance(options: BuildInstanceOptions): WorkflowInstance {
	const defaults = defaultAttributionForStatus(options.status);
	const createdAt = options.createdAt ?? new Date("2025-12-01T00:00:00.000Z");

	return WorkflowInstance.create({
		id: options.id ?? "wf-instance-1",
		entityId: options.entityId ?? "entity-1",
		entityType: options.entityType ?? "HE",
		status: options.status,
		submittedByUserId: withDefault(
			options.submittedByUserId,
			defaults.submittedByUserId,
		),
		submittedAt: withDefault(options.submittedAt, defaults.submittedAt),
		validatedByUserId: withDefault(
			options.validatedByUserId,
			defaults.validatedByUserId,
		),
		validatedAt: withDefault(options.validatedAt, defaults.validatedAt),
		approvedByUserId: withDefault(
			options.approvedByUserId,
			defaults.approvedByUserId,
		),
		approvedAt: withDefault(options.approvedAt, defaults.approvedAt),
		publishedByUserId: withDefault(
			options.publishedByUserId,
			defaults.publishedByUserId,
		),
		publishedAt: withDefault(options.publishedAt, defaults.publishedAt),
		createdAt,
		updatedAt: options.updatedAt ?? createdAt,
	});
}

/**
 * Concurrency-scenario repository: a mutable single-row store whose `update()` actually
 * enforces the expectedUpdatedAt check (same contract as DrizzleWorkflowRepository, 5j), so a
 * stale second-caller `update()` genuinely loses rather than the test asserting it by fiat.
 * `gateNextUpdate()` arms the *next* `update()` call to resolve `entered` once reached, then
 * block until released — letting the test deterministically sequence "A enters update(), B
 * commits, then A's update() releases and loses against B's committed state."
 */
function makeConcurrencyRepository(initial: WorkflowInstance) {
	let current = initial;
	let armed = false;
	let releaseGate: (() => void) | undefined;
	let resolveEntered: (() => void) | undefined;
	let thrownConcurrencyError: ConcurrentModificationError | undefined;

	const findByEntity = vi.fn().mockImplementation(async () => current);
	const update = vi
		.fn()
		.mockImplementation(
			async (instance: WorkflowInstance, expectedUpdatedAt: Date) => {
				if (armed) {
					armed = false;
					const gate = new Promise<void>((resolve) => {
						releaseGate = resolve;
					});
					resolveEntered?.();
					await gate;
				}
				// Checked after the gate releases, against whatever is current *now* — mirrors a
				// real conditional UPDATE's WHERE clause being evaluated at commit time, not call time.
				if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
					thrownConcurrencyError = new ConcurrentModificationError(
						"WorkflowInstance has been modified since it was read",
						{ entityId: instance.entityId, entityType: instance.entityType },
					);
					throw thrownConcurrencyError;
				}
				current = instance;
				return instance;
			},
		);

	// Explicit annotation (not `as IWorkflowRepository`) so a missing/mistyped
	// method fails to compile instead of being silently cast away.
	const repo: IWorkflowRepository = {
		findByEntity,
		update,
		insert: vi.fn(),
		findByEntityIds: vi.fn(),
		deleteByEntity: vi.fn(),
	};

	return {
		repo,
		getCurrentStatus: () => current.status,
		getThrownConcurrencyError: () => thrownConcurrencyError,
		/** Arms the gate and returns a promise that resolves once the gated update() call has been entered. */
		gateNextUpdate(): Promise<void> {
			armed = true;
			return new Promise<void>((resolve) => {
				resolveEntered = resolve;
			});
		},
		releaseGatedUpdate(): void {
			releaseGate?.();
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 4.1 — action-to-method mapping scenarios
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — action to entity-method mapping", () => {
	it("submit-validation calls submit() from DRAFT", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-1",
			validatorUserIds: ["validator-1"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		const dto = await useCase.execute(command);

		expect(repo.update).toHaveBeenCalledOnce();
		// Naming: the argument update() was called *with*, not its resolved return
		// value — distinct from `saved` used elsewhere for update()'s result.
		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("SUBMITTED");
		expect(updateArgs[0].submittedByUserId).toBe("user-1");
		// expectedUpdatedAt is the pre-transition snapshot findByEntity resolved.
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());
		expect(dto.status).toBe("SUBMITTED");
		// action/fromStatus/toStatus assertions: 4.4's dedicated notification
		// tests only exercise the `validate` action — this covers the other three.
		expect(notificationPort.notify).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "submit-validation",
				fromStatus: "DRAFT",
				toStatus: "SUBMITTED",
			}),
		);
	});

	it("submit-validation calls submit() from REVISION_REQUESTED", async () => {
		const instance = buildInstance({ status: "REVISION_REQUESTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-1",
			validatorUserIds: ["validator-1"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		await useCase.execute(command);

		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("SUBMITTED");
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());
	});

	it("validate with alsoApprove false validates only, status unchanged", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: false,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-2",
		};

		await useCase.execute(command);

		expect(repo.update).toHaveBeenCalledOnce();
		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("SUBMITTED");
		expect(updateArgs[0].validatedByUserId).toBe("user-2");
		expect(updateArgs[0].approvedByUserId).toBeNull();
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());
	});

	it("validate with alsoApprove true composes validate() then approve() in a single update(), stamping validatedAt === approvedAt from one shared now", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: true,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-3",
		};

		// Wrap (don't replace) the real methods and advance the fake clock between calls.
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
		const realValidate = WorkflowInstance.prototype.validate;
		const validateSpy = vi
			.spyOn(WorkflowInstance.prototype, "validate")
			.mockImplementation(function (
				this: WorkflowInstance,
				params: TransitionParams,
			) {
				const result = realValidate.call(this, params);
				vi.setSystemTime(params.now.getTime() + 1000);
				return result;
			});
		const approveSpy = vi.spyOn(WorkflowInstance.prototype, "approve");

		await useCase.execute(command);

		expect(repo.update).toHaveBeenCalledOnce();
		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("APPROVED");
		expect(updateArgs[0].validatedByUserId).toBe("user-3");
		expect(updateArgs[0].approvedByUserId).toBe("user-3");
		// getTime(), not toBe/reference equality — WorkflowInstance's getters clone the Date on every read (cloneDate).
		expect(updateArgs[0].validatedAt?.getTime()).toBe(
			updateArgs[0].approvedAt?.getTime(),
		);
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());

		expect(validateSpy).toHaveBeenCalledOnce();
		expect(approveSpy).toHaveBeenCalledOnce();
		const validateNow = validateSpy.mock.calls[0][0].now;
		const approveNow = approveSpy.mock.calls[0][0].now;
		expect(validateNow.getTime()).toBe(approveNow.getTime());
	});

	it("publish calls publish() from APPROVED", async () => {
		const instance = buildInstance({ status: "APPROVED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "publish",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-4",
		};

		await useCase.execute(command);

		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("PUBLISHED");
		expect(updateArgs[0].publishedByUserId).toBe("user-4");
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());
		expect(notificationPort.notify).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "publish",
				fromStatus: "APPROVED",
				toStatus: "PUBLISHED",
			}),
		);
	});

	it("return calls requestRevision() from SUBMITTED", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-5",
			rejectionComments: "Please revise the start date",
		};

		await useCase.execute(command);

		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("REVISION_REQUESTED");
		expect(updateArgs[1].getTime()).toBe(instance.updatedAt.getTime());
		expect(notificationPort.notify).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "return",
				fromStatus: "SUBMITTED",
				toStatus: "REVISION_REQUESTED",
			}),
		);
	});

	it("return with assigneeUserIds still calls requestRevision() from SUBMITTED — identical transition, only the notification payload differs", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-5",
			rejectionComments: "Please revise the start date",
			assigneeUserIds: ["assignee-1"],
		};

		await useCase.execute(command);

		const updateArgs = vi.mocked(repo.update).mock.calls[0];
		expect(updateArgs[0].status).toBe("REVISION_REQUESTED");
	});
});

// ---------------------------------------------------------------------------
// 4.2 — ConflictError propagation
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — ConflictError propagation", () => {
	it("publish from DRAFT propagates the entity's own ConflictError instance unmodified, without updating or notifying", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "publish",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-6",
		};

		// Capture the exact error thrown, to prove execute() propagates that same instance
		// rather than catching and re-throwing a new one.
		const realPublish = WorkflowInstance.prototype.publish;
		let thrown: unknown;
		vi.spyOn(WorkflowInstance.prototype, "publish").mockImplementation(
			function (this: WorkflowInstance, params: TransitionParams) {
				try {
					return realPublish.call(this, params);
				} catch (err) {
					thrown = err;
					throw err;
				}
			},
		);

		// Single call via try/catch, not two separate rejects.* chains — each would invoke
		// execute() (and the mock) independently, making a same-instance comparison meaningless.
		let caught: unknown;
		try {
			await useCase.execute(command);
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ConflictError);
		expect(caught).toBe(thrown);
		expect(repo.update).not.toHaveBeenCalled();
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});

	it("validate with alsoApprove true from DRAFT propagates ConflictError before any approve() is attempted", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: true,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-7",
		};
		const approveSpy = vi.spyOn(WorkflowInstance.prototype, "approve");

		await expect(useCase.execute(command)).rejects.toBeInstanceOf(
			ConflictError,
		);
		expect(repo.update).not.toHaveBeenCalled();
		expect(approveSpy).not.toHaveBeenCalled();
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 4.3 — not-found and update-error propagation
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — not-found and update-error propagation", () => {
	it("rejects with WorkflowInstanceNotFoundError when findByEntity resolves null, without updating", async () => {
		const repo = makeRepository(null);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: "missing-entity",
			entityType: "HE",
			actingUserId: "user-8",
			validatorUserIds: ["validator-1"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		await expect(useCase.execute(command)).rejects.toBeInstanceOf(
			WorkflowInstanceNotFoundError,
		);
		expect(repo.update).not.toHaveBeenCalled();
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});

	it("Repository update throws a generic error", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		const dbError = new Error("DB connection lost");
		const repo = makeRepository(instance, () => Promise.reject(dbError));
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-9",
			validatorUserIds: ["validator-1"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		await expect(useCase.execute(command)).rejects.toBe(dbError);
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 4.4 — notify-exactly-once and notify-failure-tolerance
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — notification", () => {
	it("notifies exactly once with fromStatus === toStatus when validate (alsoApprove false) leaves status unchanged", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: false,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-10",
		};

		await useCase.execute(command);

		expect(notificationPort.notify).toHaveBeenCalledOnce();
		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		expect(notification).toMatchObject({
			instanceId: instance.id,
			entityId: instance.entityId,
			entityType: instance.entityType,
			action: "validate",
			fromStatus: "SUBMITTED",
			toStatus: "SUBMITTED",
			actingUserId: "user-10",
		});
		expect(notification.occurredAt).toBeInstanceOf(Date);
	});

	it("notifies exactly once reflecting the final status when validate (alsoApprove true) changes status", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: true,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-11",
		};

		await useCase.execute(command);

		expect(notificationPort.notify).toHaveBeenCalledOnce();
		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		expect(notification).toMatchObject({
			instanceId: instance.id,
			entityId: instance.entityId,
			entityType: instance.entityType,
			action: "validate",
			fromStatus: "SUBMITTED",
			toStatus: "APPROVED",
			actingUserId: "user-11",
		});
		expect(notification.occurredAt).toBeInstanceOf(Date);
	});

	it("still resolves with the saved WorkflowInstanceDto and logs a WARN when notify() rejects after a successful update", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notifyError = new Error("notification channel unavailable");
		const notificationPort = makeNotificationPort(() =>
			Promise.reject(notifyError),
		);
		const logger = new NoOpLogger();
		const warnSpy = vi.spyOn(logger, "warn");
		const errorSpy = vi.spyOn(logger, "error");
		const useCase = new ProcessWorkflowActionUseCase(
			logger,
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: false,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-12",
		};

		// Awaiting without a catch is itself the assertion that execute()'s promise doesn't
		// reject — if notify()'s rejection propagated instead of being swallowed, this await
		// would throw.
		const dto = await useCase.execute(command);
		const updateArgs = vi.mocked(repo.update).mock.calls[0];

		expect(dto.status).toBe(updateArgs[0].status);
		expect(dto.updatedAt).toBe(updateArgs[0].updatedAt.toISOString());
		// WARN not ERROR: a tolerated degradation (ADR-004), not a broken system. Full record
		// (not just "was called") since this is the only trace of the swallowed failure (DEF-023).
		expect(warnSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "workflow_action.notify_failed",
				err: notifyError,
				instanceId: instance.id,
				entityId: instance.entityId,
				entityType: instance.entityType,
				action: "validate",
				actingUserId: "user-12",
			}),
		);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("logs an INFO line on every successful execute(), reflecting the actual transition", async () => {
		const instance = buildInstance({ status: "APPROVED" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const logger = new NoOpLogger();
		const infoSpy = vi.spyOn(logger, "info");
		const useCase = new ProcessWorkflowActionUseCase(
			logger,
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "publish",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-15",
		};

		await useCase.execute(command);

		expect(infoSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				msg: "workflow_action.processed",
				instanceId: instance.id,
				entityId: instance.entityId,
				entityType: instance.entityType,
				action: "publish",
				fromStatus: "APPROVED",
				toStatus: "PUBLISHED",
				actingUserId: "user-15",
			}),
		);
	});

	it("still resolves and falls back to console.error when both notify() and the injected ILogger reject/throw", async () => {
		const instance = buildInstance({ status: "SUBMITTED" });
		const repo = makeRepository(instance);
		const notifyError = new Error("notification channel unavailable");
		const notificationPort = makeNotificationPort(() =>
			Promise.reject(notifyError),
		);
		const logger = new NoOpLogger();
		vi.spyOn(logger, "warn").mockImplementation(() => {
			throw new Error("logger transport unavailable");
		});
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const useCase = new ProcessWorkflowActionUseCase(
			logger,
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: false,
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-14",
		};

		// Same assertion shape as the sibling test above: a rejection here means
		// the double-failure escaped its guard and broke Decision 8's guarantee.
		const dto = await useCase.execute(command);

		expect(dto.status).toBe("SUBMITTED");
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"workflow_action.notify_failed (logger also failed)",
			notifyError,
			expect.objectContaining({ action: "validate" }),
		);
	});
});

// ---------------------------------------------------------------------------
// 4.5 — saved (not pre-update) feeds the DTO
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — DTO and notify() reflect update()'s resolved value", () => {
	it("returns a DTO reflecting update()'s resolved (enriched) instance, not the pre-update transitioned instance, and notify() receives the same enriched instanceId", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		// `enriched` has a distinct id/updatedAt from the pre-update transitioned instance, so a
		// regression that fed `transitioned` (not `saved`) into the DTO mapper or notify() would be caught.
		const enriched = buildInstance({
			id: "enriched-instance-id",
			entityId: instance.entityId,
			entityType: instance.entityType,
			status: "SUBMITTED",
			submittedByUserId: "user-13",
			submittedAt: new Date("2026-03-01T00:00:00.000Z"),
			updatedAt: new Date("2026-03-01T00:00:00.000Z"),
		});
		const repo = makeRepository(instance, () => Promise.resolve(enriched));
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-13",
			validatorUserIds: ["validator-1"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		const dto = await useCase.execute(command);

		expect(dto.updatedAt).toBe(enriched.updatedAt.toISOString());
		expect(dto.id).toBe("enriched-instance-id");
		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		expect(notification.instanceId).toBe("enriched-instance-id");
	});
});

// ---------------------------------------------------------------------------
// 4.6 — concurrent callers (stale caller rejected with ConcurrentModificationError)
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — concurrent callers race at the repository tier", () => {
	it("a stale caller's execute() rejects with ConcurrentModificationError (propagated unmodified) when another caller already committed; the winner's state is not overwritten", async () => {
		const initial = buildInstance({
			status: "SUBMITTED",
			entityId: "entity-concurrent",
			entityType: "HE",
		});
		const {
			repo,
			getCurrentStatus,
			getThrownConcurrencyError,
			gateNextUpdate,
			releaseGatedUpdate,
		} = makeConcurrencyRepository(initial);
		const notifications: WorkflowActionNotification[] = [];
		const notificationPort: INotificationPort = {
			notify: vi
				.fn()
				.mockImplementation(async (n: WorkflowActionNotification) => {
					notifications.push(n);
				}),
		};
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);

		// (a) Arm the gate, then start A's stale 'return' call. Its update() call will block on
		// the gate once entered — proving it read the pre-B SUBMITTED snapshot first.
		const aEntered = gateNextUpdate();
		const aCommand: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: "entity-concurrent",
			entityType: "HE",
			actingUserId: "user-a",
			rejectionComments: "Please revise the start date",
		};
		const aPromise = useCase.execute(aCommand);
		// Races against aPromise itself: if A's execute() rejects before reaching update() (e.g.
		// a ConflictError from a bad invariant), this fails fast instead of hanging on the gate.
		await Promise.race([aEntered, aPromise]);

		// (b) Only now run B's call to completion — validate()+approve() composed into one
		// update() call, committing APPROVED while A is still gated on its stale read.
		const bCommand: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: true,
			entityId: "entity-concurrent",
			entityType: "HE",
			actingUserId: "user-b",
		};
		const bDto = await useCase.execute(bCommand);

		// (c) Release A's gated update() — it now checks its stale expectedUpdatedAt against
		// B's already-committed state and must lose.
		releaseGatedUpdate();
		let aError: unknown;
		try {
			await aPromise;
		} catch (err) {
			aError = err;
		}

		expect(aError).toBeInstanceOf(ConcurrentModificationError);
		// Propagated unmodified (design.md Decision 6) — same error instance, no wrapper or retry.
		expect(aError).toBe(getThrownConcurrencyError());
		expect(getCurrentStatus()).toBe("APPROVED");
		expect(bDto.status).toBe("APPROVED");

		// Notify fires only for B's successful call — A's rejected update() never reaches notify().
		expect(notificationPort.notify).toHaveBeenCalledTimes(1);
		expect(notifications[0].toStatus).toBe("APPROVED");
		expect(notifications[0].action).toBe("validate");
	});
});

// ---------------------------------------------------------------------------
// 2.1 (ADDED requirement) — action-specific notification-payload pass-through
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — notification payload action-specific field pass-through", () => {
	it("submit-validation's command fields reach the notification payload unmodified", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "submit-validation",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-1",
			validatorUserIds: ["v1", "v2"],
			recordDisplayName: "Flood",
			recordDate: "2026-10-01",
		};

		await useCase.execute(command);

		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		if (notification.action !== "submit-validation") {
			throw new Error("expected a submit-validation notification");
		}
		expect(notification.validatorUserIds).toEqual(["v1", "v2"]);
		expect(notification.recordDisplayName).toBe("Flood");
		expect(notification.recordDate).toBe("2026-10-01");
	});

	it("return's rejectionComments and assigneeUserIds reach the notification payload unmodified, alongside the saved instance's submittedByUserId", async () => {
		const instance = buildInstance({
			status: "SUBMITTED",
			submittedByUserId: "submitter-1",
		});
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-5",
			rejectionComments: "Fix the location",
			assigneeUserIds: ["assignee-1", "assignee-2"],
		};

		await useCase.execute(command);

		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		if (notification.action !== "return") {
			throw new Error("expected a return notification");
		}
		expect(notification.rejectionComments).toBe("Fix the location");
		expect(notification.assigneeUserIds).toEqual(["assignee-1", "assignee-2"]);
		expect(notification.submittedByUserId).toBe("submitter-1");
	});

	it("return without assigneeUserIds omits the field from the notification payload", async () => {
		const instance = buildInstance({
			status: "SUBMITTED",
			submittedByUserId: "submitter-1",
		});
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-5",
			rejectionComments: "Fix the location",
		};

		await useCase.execute(command);

		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		if (notification.action !== "return") {
			throw new Error("expected a return notification");
		}
		expect(notification.rejectionComments).toBe("Fix the location");
		// toBeUndefined() alone passes whether the key is absent or present-as-undefined —
		// `in` is what actually proves the conditional spread (ProcessWorkflowAction.ts)
		// omits the key entirely rather than setting it to undefined.
		expect("assigneeUserIds" in notification).toBe(false);
		expect(notification.submittedByUserId).toBe("submitter-1");
	});

	it("validate and publish notification payloads never carry the five action-specific fields", async () => {
		const instance = buildInstance({
			status: "APPROVED",
			submittedByUserId: "submitter-2",
		});
		const repo = makeRepository(instance);
		const notificationPort = makeNotificationPort();
		const useCase = new ProcessWorkflowActionUseCase(
			new NoOpLogger(),
			repo,
			notificationPort,
		);
		const command: ProcessWorkflowActionCommand = {
			action: "publish",
			entityId: instance.entityId,
			entityType: instance.entityType,
			actingUserId: "user-4",
		};

		await useCase.execute(command);

		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		// "publish"'s branch declares none of these fields (ISP finding) — `in` checks the
		// object directly since the type doesn't admit accessing them as properties.
		expect("validatorUserIds" in notification).toBe(false);
		expect("recordDisplayName" in notification).toBe(false);
		expect("recordDate" in notification).toBe(false);
		expect("rejectionComments" in notification).toBe(false);
		expect("assigneeUserIds" in notification).toBe(false);
		expect(notification.submittedByUserId).toBe("submitter-2");
	});
});
