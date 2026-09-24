import { afterEach, describe, expect, it, vi } from "vitest";

import { NoOpLogger } from "~/shared/logging/NoOpLogger";
import { ConflictError } from "~/shared/errors";

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
 * instance (or null); `save` echoes its argument unless a custom impl is given. */
function makeRepository(
	instance: WorkflowInstance | null,
	saveImpl?: (instance: WorkflowInstance) => Promise<WorkflowInstance>,
): IWorkflowRepository {
	return {
		findByEntity: vi.fn().mockResolvedValue(instance),
		findByEntityIds: vi.fn(),
		save: saveImpl
			? vi.fn().mockImplementation(saveImpl)
			: vi.fn().mockImplementation((i: WorkflowInstance) => Promise.resolve(i)),
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

/** `??` would treat an explicit `null` override the same as "not passed" and
 * fall back to the status default — checking `undefined` specifically lets a
 * scenario force a field to `null` against its status default if it ever needs to. */
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
 * Concurrency-scenario repository: a mutable single-row store (not per-call
 * stubs), so a second execute() call reads whatever the first actually persisted.
 * `gateNextSave()` arms the *next* save() call to resolve `entered` once reached,
 * then block on a manually-released promise before writing — letting the test
 * deterministically sequence "A enters save(), B completes twice, then A's
 * save() releases" without any timers.
 */
function makeConcurrencyRepository(initial: WorkflowInstance) {
	let current = initial;
	let armed = false;
	let releaseGate: (() => void) | undefined;
	let resolveEntered: (() => void) | undefined;

	const findByEntity = vi.fn().mockImplementation(async () => current);
	const save = vi
		.fn()
		.mockImplementation(async (instance: WorkflowInstance) => {
			if (armed) {
				armed = false;
				const gate = new Promise<void>((resolve) => {
					releaseGate = resolve;
				});
				resolveEntered?.();
				await gate;
			}
			current = instance;
			return instance;
		});

	// Explicit annotation (not `as IWorkflowRepository`) so a missing/mistyped
	// method fails to compile instead of being silently cast away.
	const repo: IWorkflowRepository = {
		findByEntity,
		save,
		findByEntityIds: vi.fn(),
	};

	return {
		repo,
		getCurrentStatus: () => current.status,
		/** Arms the gate and returns a promise that resolves once the gated save() call has been entered. */
		gateNextSave(): Promise<void> {
			armed = true;
			return new Promise<void>((resolve) => {
				resolveEntered = resolve;
			});
		},
		releaseGatedSave(): void {
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
		};

		const dto = await useCase.execute(command);

		expect(repo.save).toHaveBeenCalledOnce();
		// Naming: the argument save() was called *with*, not its resolved return
		// value — distinct from `saved` used elsewhere for save()'s result.
		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("SUBMITTED");
		expect(saveArg.submittedByUserId).toBe("user-1");
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
		};

		await useCase.execute(command);

		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("SUBMITTED");
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

		expect(repo.save).toHaveBeenCalledOnce();
		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("SUBMITTED");
		expect(saveArg.validatedByUserId).toBe("user-2");
		expect(saveArg.approvedByUserId).toBeNull();
	});

	it("validate with alsoApprove true composes validate() then approve() in a single save(), stamping validatedAt === approvedAt from one shared now", async () => {
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

		expect(repo.save).toHaveBeenCalledOnce();
		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("APPROVED");
		expect(saveArg.validatedByUserId).toBe("user-3");
		expect(saveArg.approvedByUserId).toBe("user-3");
		// getTime(), not toBe/reference equality — WorkflowInstance's getters clone the Date on every read (cloneDate).
		expect(saveArg.validatedAt?.getTime()).toBe(saveArg.approvedAt?.getTime());

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

		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("PUBLISHED");
		expect(saveArg.publishedByUserId).toBe("user-4");
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
		};

		await useCase.execute(command);

		const saveArg = vi.mocked(repo.save).mock.calls[0][0];
		expect(saveArg.status).toBe("REVISION_REQUESTED");
		expect(notificationPort.notify).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "return",
				fromStatus: "SUBMITTED",
				toStatus: "REVISION_REQUESTED",
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// 4.2 — ConflictError propagation
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — ConflictError propagation", () => {
	it("publish from DRAFT propagates the entity's own ConflictError instance unmodified, without saving or notifying", async () => {
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

		// Capture the exact error the entity method throws, so we can prove
		// execute() propagates that same instance rather than
		// catching and re-throwing a new one.
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

		// Single call, captured via try/catch (not two separate rejects.* chains,
		// which would each invoke execute() — and the mock — independently,
		// making a same-instance comparison meaningless across two calls).
		let caught: unknown;
		try {
			await useCase.execute(command);
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(ConflictError);
		expect(caught).toBe(thrown);
		expect(repo.save).not.toHaveBeenCalled();
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
		expect(repo.save).not.toHaveBeenCalled();
		expect(approveSpy).not.toHaveBeenCalled();
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 4.3 — not-found and save-error propagation
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — not-found and save-error propagation", () => {
	it("rejects with WorkflowInstanceNotFoundError when findByEntity resolves null, without saving", async () => {
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
		};

		await expect(useCase.execute(command)).rejects.toBeInstanceOf(
			WorkflowInstanceNotFoundError,
		);
		expect(repo.save).not.toHaveBeenCalled();
		expect(notificationPort.notify).not.toHaveBeenCalled();
	});

	it("propagates a repository save() error unmodified, without notifying", async () => {
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

	it("still resolves with the saved WorkflowInstanceDto and logs a WARN when notify() rejects after a successful save", async () => {
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

		// Awaiting without a catch is itself the assertion that execute()'s
		// promise does not reject: if notify()'s rejection propagated instead
		// of being swallowed, this await would throw and fail the test.
		const dto = await useCase.execute(command);
		const saveArg = vi.mocked(repo.save).mock.calls[0][0];

		expect(dto.status).toBe(saveArg.status);
		expect(dto.updatedAt).toBe(saveArg.updatedAt.toISOString());
		// WARN, not ERROR: a swallowed, tolerated degradation (ADR-004), not a broken system.
		// Full record, not just "was called" — this log line is the only record
		// of a swallowed notify() failure (DEF-023, no retry mechanism).
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
// 4.5 — saved (not pre-save) feeds the DTO
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — DTO and notify() reflect save()'s resolved value", () => {
	it("returns a DTO reflecting save()'s resolved (enriched) instance, not the pre-save transitioned instance, and notify() receives the same enriched instanceId", async () => {
		const instance = buildInstance({ status: "DRAFT" });
		// `enriched` has a distinct id/updatedAt from the pre-save transitioned instance, so a
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
		};

		const dto = await useCase.execute(command);

		expect(dto.updatedAt).toBe(enriched.updatedAt.toISOString());
		expect(dto.id).toBe("enriched-instance-id");
		const notification = vi.mocked(notificationPort.notify).mock.calls[0][0];
		expect(notification.instanceId).toBe("enriched-instance-id");
	});
});

// ---------------------------------------------------------------------------
// 4.6 — concurrent callers (corrected 3-save/3-notify scenario)
// ---------------------------------------------------------------------------

describe("ProcessWorkflowActionUseCase — concurrent callers race at the repository tier", () => {
	it("a stale-read 'return' silently overwrites a concurrently-published record; 3 saves, 3 notifies, final status REVISION_REQUESTED", async () => {
		const initial = buildInstance({
			status: "SUBMITTED",
			entityId: "entity-concurrent",
			entityType: "HE",
		});
		const { repo, getCurrentStatus, gateNextSave, releaseGatedSave } =
			makeConcurrencyRepository(initial);
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

		// (a) Arm the gate, then start A's stale 'return' call. Its save() will
		// block on the gate once entered — proving it read the stale SUBMITTED
		// snapshot before either of B's calls ran.
		const aEntered = gateNextSave();
		const aCommand: ProcessWorkflowActionCommand = {
			action: "return",
			entityId: "entity-concurrent",
			entityType: "HE",
			actingUserId: "user-a",
		};
		const aPromise = useCase.execute(aCommand);
		// Race against aPromise itself: if A's execute() rejects before ever
		// reaching save() (e.g. a ConflictError from a wrong invariant above),
		// this fails fast instead of hanging until aEntered's gate times out.
		await Promise.race([aEntered, aPromise]);

		// (b) Only now run BOTH of B's calls to completion, sequentially. The
		// second reads the store's current state — B's own first save() result,
		// not the stale snapshot A is still holding.
		const bValidateCommand: ProcessWorkflowActionCommand = {
			action: "validate",
			alsoApprove: true,
			entityId: "entity-concurrent",
			entityType: "HE",
			actingUserId: "user-b",
		};
		const bValidateDto = await useCase.execute(bValidateCommand);

		const bPublishCommand: ProcessWorkflowActionCommand = {
			action: "publish",
			entityId: "entity-concurrent",
			entityType: "HE",
			actingUserId: "user-b",
		};
		const bPublishDto = await useCase.execute(bPublishCommand);

		// (c) Only now release A's gated save(), letting it finish last and
		// overwrite the store's current PUBLISHED state with REVISION_REQUESTED.
		releaseGatedSave();
		const aDto = await aPromise;

		expect(repo.save).toHaveBeenCalledTimes(3);
		expect(notificationPort.notify).toHaveBeenCalledTimes(3);
		expect(notifications.map((n) => n.toStatus)).toEqual([
			"APPROVED",
			"PUBLISHED",
			"REVISION_REQUESTED",
		]);
		expect(notifications.map((n) => n.action)).toEqual([
			"validate",
			"publish",
			"return",
		]);
		expect(getCurrentStatus()).toBe("REVISION_REQUESTED");

		// Plain successful DTOs — no error indicator of any kind for any caller.
		expect(aDto.status).toBe("REVISION_REQUESTED");
		expect(bValidateDto.status).toBe("APPROVED");
		expect(bPublishDto.status).toBe("PUBLISHED");
	});
});
