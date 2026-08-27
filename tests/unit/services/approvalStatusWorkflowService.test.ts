import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	disasterEventByIdMock,
	disasterEventUpdateApprovalStatusValidateMock,
	disasterEventUpdateApprovalStatusPublishMock,
	disasterEventUpdateApprovalStatusNeedRevisionMock,
	disasterEventUpdateApprovalStatusOnGoingMock,
	disasterRecordsByIdMock,
	disasterRecordsUpdateApprovalStatusValidateMock,
	disasterRecordsUpdateApprovalStatusPublishMock,
	disasterRecordsUpdateApprovalStatusNeedRevisionMock,
	disasterRecordsUpdateApprovalStatusOnGoingMock,
	drMock,
	userCountryAccountsRepositoryMock,
} = vi.hoisted(() => ({
	disasterEventByIdMock: vi.fn(),
	disasterEventUpdateApprovalStatusValidateMock: vi.fn(),
	disasterEventUpdateApprovalStatusPublishMock: vi.fn(),
	disasterEventUpdateApprovalStatusNeedRevisionMock: vi.fn(),
	disasterEventUpdateApprovalStatusOnGoingMock: vi.fn(),
	disasterRecordsByIdMock: vi.fn(),
	disasterRecordsUpdateApprovalStatusValidateMock: vi.fn(),
	disasterRecordsUpdateApprovalStatusPublishMock: vi.fn(),
	disasterRecordsUpdateApprovalStatusNeedRevisionMock: vi.fn(),
	disasterRecordsUpdateApprovalStatusOnGoingMock: vi.fn(),
	drMock: {
		select: vi.fn(),
		from: vi.fn(),
		where: vi.fn(),
		limit: vi.fn(),
		transaction: vi.fn(),
	},
	userCountryAccountsRepositoryMock: vi.fn(),
}));

vi.mock("~/db.server", () => ({
	dr: drMock,
}));

vi.mock("~/db/queries/userCountryAccountsRepository", () => ({
	getUserCountryAccountsByUserIdAndCountryAccountsId:
		userCountryAccountsRepositoryMock,
}));

vi.mock("~/backend.server/handlers/commondata", () => ({
	getCommonData: vi.fn(async () => ({ lang: "en", user: null })),
}));

vi.mock("~/backend.server/models/event", () => ({
	disasterEventById: disasterEventByIdMock,
	disasterEventUpdateApprovalStatusValidate:
		disasterEventUpdateApprovalStatusValidateMock,
	disasterEventUpdateApprovalStatusPublish:
		disasterEventUpdateApprovalStatusPublishMock,
	disasterEventUpdateApprovalStatusNeedRevision:
		disasterEventUpdateApprovalStatusNeedRevisionMock,
	disasterEventUpdateApprovalStatusOnGoing:
		disasterEventUpdateApprovalStatusOnGoingMock,
}));

vi.mock("~/backend.server/models/disaster_record", () => ({
	disasterRecordsById: disasterRecordsByIdMock,
	disasterRecordsUpdateApprovalStatusValidate:
		disasterRecordsUpdateApprovalStatusValidateMock,
	disasterRecordsUpdateApprovalStatusPublish:
		disasterRecordsUpdateApprovalStatusPublishMock,
	disasterRecordsUpdateApprovalStatusNeedRevision:
		disasterRecordsUpdateApprovalStatusNeedRevisionMock,
	disasterRecordsUpdateApprovalStatusOnGoing:
		disasterRecordsUpdateApprovalStatusOnGoingMock,
}));

vi.mock("~/backend.server/models/entity_validation_assignment", () => ({
	entityValidationAssignmentDeleteByEntityId: vi.fn(),
}));

const createMockCtx = () =>
	({
		t: ({ msg }: { msg: string }) => msg,
		fullUrl: (path: string) => `http://localhost${path}`,
	}) as any;

describe("approval-status guard rules", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("createTranslationGetter", () => (key: string) => key);
		drMock.select.mockReturnValue(drMock);
		drMock.from.mockReturnValue(drMock);
		drMock.where.mockReturnValue(drMock);
		drMock.limit.mockResolvedValue([]);
		drMock.transaction.mockImplementation(async (cb) => cb({}));
	});

	it("blocks validating a disaster event without any approved disaster records", async () => {
		const { updateDisasterEventStatusService } =
			await import("~/services/disasterEventService");

		disasterEventByIdMock.mockResolvedValue({
			id: "event-1",
			countryAccountsId: "country-1",
			approvalStatus: "draft",
		});
		drMock.limit.mockResolvedValue([]);

		const result = await updateDisasterEventStatusService({
			ctx: createMockCtx(),
			id: "event-1",
			approvalStatus: "validated",
			countryAccountsId: "country-1",
			userId: "user-1",
		});

		expect(result.ok).toBe(false);
		expect(result.message).toContain(
			"at least one associated published or validated disaster record",
		);
		expect(
			disasterEventUpdateApprovalStatusValidateMock,
		).not.toHaveBeenCalled();
	});

	it("blocks returning the only approved record for an approved disaster event to edit", async () => {
		const { updateDisasterRecordStatusService } =
			await import("~/services/disasterRecordService");

		disasterRecordsByIdMock.mockResolvedValue({
			id: "record-1",
			countryAccountsId: "country-1",
			approvalStatus: "validated",
			disasterEventId: "event-1",
		});
		drMock.limit
			.mockResolvedValueOnce([{ id: "event-1" }])
			.mockResolvedValueOnce([]);

		const result = await updateDisasterRecordStatusService({
			ctx: createMockCtx(),
			id: "record-1",
			approvalStatus: "needs-revision",
			countryAccountsId: "country-1",
			userId: "user-1",
		});

		expect(result.ok).toBe(false);
		expect(result.message).toContain(
			"only published or validated disaster record linked to a validated or published disaster event",
		);
		expect(
			disasterRecordsUpdateApprovalStatusNeedRevisionMock,
		).not.toHaveBeenCalled();
	});

	it("blocks the direct disaster-event validation workflow when no approved record is linked", async () => {
		const { handleApprovalWorkflowService } =
			await import("~/backend.server/services/approvalWorkflowService");

		userCountryAccountsRepositoryMock.mockResolvedValue({ role: "admin" });
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ approvalStatus: "draft" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn(),
				}),
			}),
		};

		await expect(
			handleApprovalWorkflowService(
				createMockCtx(),
				tx as any,
				"event-1",
				"disaster_event",
				{
					updatedByUserId: "user-1",
					countryAccountsId: "country-1",
					tempAction: "submit-validate",
				},
			),
		).rejects.toThrow(
			"A validated or published disaster event must have at least one associated published or validated disaster record.",
		);
	});

	it("returns a form error instead of throwing when approval validation fails during save", async () => {
		const { formSave } = await import("~/backend.server/handlers/form/form");

		const result = await formSave({
			actionArgs: {
				request: new Request("http://localhost/en/disaster-event/123", {
					method: "POST",
					body: new URLSearchParams({}),
				}),
				params: { lang: "en", id: "123" },
			} as any,
			userRole: "admin",
			fieldsDef: [],
			save: async () => {
				throw new Error(
					"A validated or published disaster event must have at least one associated published or validated disaster record.",
				);
			},
			redirectTo: (id: string) => `/disaster-event/${id}`,
		});

		expect(result).toMatchObject({
			ok: false,
			errors: {
				form: [
					"A validated or published disaster event must have at least one associated published or validated disaster record.",
				],
			},
		});
	}, 15000);
});
