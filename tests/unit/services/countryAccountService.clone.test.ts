import { beforeEach, describe, expect, it, vi } from "vitest";

const countryAccountsRepositoryGetByIdWithCountryMock = vi.fn();
const countryAccountsRepositoryCreateMock = vi.fn();
const instanceSystemSettingRepositoryGetByCountryAccountIdMock = vi.fn();
const instanceSystemSettingRepositoryCreateMock = vi.fn();
const organizationRepositoryGetByCountryAccountsIdMock = vi.fn();
const organizationRepositoryCreateManyMock = vi.fn();
const userCountryAccountRepositoryGetByCountryAccountsIdMock = vi.fn();
const userCountryAccountRepositoryCreateManyMock = vi.fn();
const hazardousEventRepositoryGetByCountryAccountsIdMock = vi.fn();
const disasterEventRepositoryGetByCountryAccountsIdMock = vi.fn();
const disasterEventRepositoryCreateManyMock = vi.fn();
const disasterEventAttachmentRepositoryGetByDisasterEventIdsMock = vi.fn();
const disasterEventLinkRepositoryGetByDisasterEventIdsMock = vi.fn();
const eventRepositoryGetByIdsMock = vi.fn();
const eventRepositoryCreateManyMock = vi.fn();
const eventRelationshipRepositoryGetByEventIdsMock = vi.fn();
const disasterRecordsRepositoryGetByCountryAccountsIdMock = vi.fn();
const disasterRecordsRepositoryCreateManyMock = vi.fn();
const humanDsgConfigRepositoryGetByCountryAccountsIdMock = vi.fn();
const humanDsgConfigRepositoryCreateManyMock = vi.fn();
const divisionRepositoryGetByCountryAccountsIdMock = vi.fn();
const divisionRepositoryCreateManyMock = vi.fn();
const assetRepositoryGetByCountryAccountsIdMock = vi.fn();
const assetRepositoryCreateManyMock = vi.fn();
const apiKeyRepositoryGetByCountryAccountsIdMock = vi.fn();
const apiKeyRepositoryCreateManyMock = vi.fn();
const humanDsgRepositoryGetByRecordIdsMock = vi.fn();
const humanDsgRepositoryCreateManyMock = vi.fn();
const affectedRepositoryGetByDsgIdsMock = vi.fn();
const affectedRepositoryCreateManyMock = vi.fn();
const displacedRepositoryGetByDsgIdsMock = vi.fn();
const displacedRepositoryCreateManyMock = vi.fn();
const deathRepositoryGetByDsgIdsMock = vi.fn();
const deathRepositoryCreateManyMock = vi.fn();
const missingRepositoryGetByDsgIdsMock = vi.fn();
const missingRepositoryCreateManyMock = vi.fn();
const injuredRepositoryGetByDsgIdsMock = vi.fn();
const injuredRepositoryCreateManyMock = vi.fn();
const disruptionRepositoryGetByRecordIdsMock = vi.fn();
const disruptionRepositoryCreateManyMock = vi.fn();
const humanCategoryPresenceRepositoryGetByRecordIdsMock = vi.fn();
const humanCategoryPresenceRepositoryCreateManyMock = vi.fn();
const nonEcoLossesRepositoryGetByRecordIdsMock = vi.fn();
const nonEcoLossesRepositoryCreateManyMock = vi.fn();
const sectorDisasterRecordsRelationRepositoryGetByRecordIdsMock = vi.fn();
const sectorDisasterRecordsRelationRepositoryCreateManyMock = vi.fn();
const lossesRepositoryGetByRecordIdsMock = vi.fn();
const lossesRepositoryCreateManyMock = vi.fn();
const damagesRepositoryGetByRecordIdsMock = vi.fn();
const damagesRepositoryCreateManyMock = vi.fn();
const entityValidationAssignmentRepositoryGetByEntityIdsMock = vi.fn();
const entityValidationAssignmentRepositoryCreateManyMock = vi.fn();
const entityValidationRejectionRepositoryGetByEntityIdsMock = vi.fn();
const entityValidationRejectionRepositoryCreateManyMock = vi.fn();
const drTransactionMock = vi.fn();

vi.mock("~/db.server", () => ({
	dr: {
		transaction: drTransactionMock,
	},
}));

vi.mock("~/db/queries/countryAccountsRepository", () => ({
	CountryAccountsRepository: {
		getByIdWithCountry: countryAccountsRepositoryGetByIdWithCountryMock,
		create: countryAccountsRepositoryCreateMock,
	},
}));

vi.mock("~/db/queries/instanceSystemSettingRepository", () => ({
	InstanceSystemSettingRepository: {
		getByCountryAccountId: instanceSystemSettingRepositoryGetByCountryAccountIdMock,
		create: instanceSystemSettingRepositoryCreateMock,
	},
}));

vi.mock("~/db/queries/organizationRepository", () => ({
	OrganizationRepository: {
		getByCountryAccountsId: organizationRepositoryGetByCountryAccountsIdMock,
		createMany: organizationRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/userCountryAccountsRepository", () => ({
	UserCountryAccountRepository: {
		getByCountryAccountsId: userCountryAccountRepositoryGetByCountryAccountsIdMock,
		createMany: userCountryAccountRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/hazardousEventRepository", () => ({
	HazardousEventRepository: {
		getByCountryAccountsId: hazardousEventRepositoryGetByCountryAccountsIdMock,
		createMany: vi.fn(),
	},
}));

vi.mock("~/db/queries/disasterEventRepository", () => ({
	DisasterEventRepository: {
		getByCountryAccountsId: disasterEventRepositoryGetByCountryAccountsIdMock,
		createMany: disasterEventRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/eventRepository", () => ({
	EventRepository: {
		getByIds: eventRepositoryGetByIdsMock,
		createMany: eventRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/disasterEventAttachmentRepository", () => ({
	DisasterEventAttachmentRepository: {
		getByDisasterEventIds: disasterEventAttachmentRepositoryGetByDisasterEventIdsMock,
		createMany: vi.fn(),
	},
}));

vi.mock("~/db/queries/disasterEventLinkRepository", () => ({
	DisasterEventLinkRepository: {
		getByDisasterEventIds: disasterEventLinkRepositoryGetByDisasterEventIdsMock,
		createMany: vi.fn(),
	},
}));

vi.mock("~/db/queries/eventRelationshipRepository", () => ({
	EventRelationshipRepository: {
		getByEventIds: eventRelationshipRepositoryGetByEventIdsMock,
		createMany: vi.fn(),
	},
}));

vi.mock("~/db/queries/humanDsgConfigRepository", () => ({
	HumanDsgConfigRepository: {
		getByCountryAccountsId: humanDsgConfigRepositoryGetByCountryAccountsIdMock,
		createMany: humanDsgConfigRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/divisonRepository", () => ({
	DivisionRepository: {
		getByCountryAccountsId: divisionRepositoryGetByCountryAccountsIdMock,
		createMany: divisionRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/assetRepository", () => ({
	AssetRepository: {
		getByCountryAccountsId: assetRepositoryGetByCountryAccountsIdMock,
		createMany: assetRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/apiKeyRepository", () => ({
	ApiKeyRepository: {
		getByCountryAccountsId: apiKeyRepositoryGetByCountryAccountsIdMock,
		createMany: apiKeyRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/disasterRecordsRepository", () => ({
	DisasterRecordsRepository: {
		getByCountryAccountsId: disasterRecordsRepositoryGetByCountryAccountsIdMock,
		createMany: disasterRecordsRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/humanDsgRepository", () => ({
	HumanDsgRepository: {
		getByRecordIds: humanDsgRepositoryGetByRecordIdsMock,
		createMany: humanDsgRepositoryCreateManyMock,
		getByDsgIds: vi.fn(),
	},
}));

vi.mock("~/db/queries/affectedRepository", () => ({
	AffectedRepository: {
		getByDsgIds: affectedRepositoryGetByDsgIdsMock,
		createMany: affectedRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/displacedRepository", () => ({
	DisplacedRepository: {
		getByDsgIds: displacedRepositoryGetByDsgIdsMock,
		createMany: displacedRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/deathRepository", () => ({
	DeathRepository: {
		getByDsgIds: deathRepositoryGetByDsgIdsMock,
		createMany: deathRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/missingRepository", () => ({
	MissingRepository: {
		getByDsgIds: missingRepositoryGetByDsgIdsMock,
		createMany: missingRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/injuredRepository", () => ({
	InjuredRepository: {
		getByDsgIds: injuredRepositoryGetByDsgIdsMock,
		createMany: injuredRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/disruptionRepository", () => ({
	DisruptionRepository: {
		getByRecordIds: disruptionRepositoryGetByRecordIdsMock,
		createMany: disruptionRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/humanCategoryPresenceRepository", () => ({
	HumanCategoryPresenceRepository: {
		getByRecordIds: humanCategoryPresenceRepositoryGetByRecordIdsMock,
		createMany: humanCategoryPresenceRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/nonEcoLossesRepository", () => ({
	NonEcoLossesRepository: {
		getByRecordIds: nonEcoLossesRepositoryGetByRecordIdsMock,
		createMany: nonEcoLossesRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/sectorDisasterRecordsRelationRepository", () => ({
	SectorDisasterRecordsRelationRepository: {
		getByRecordIds: sectorDisasterRecordsRelationRepositoryGetByRecordIdsMock,
		createMany: sectorDisasterRecordsRelationRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/lossesRepository", () => ({
	LossesRepository: {
		getByRecordIds: lossesRepositoryGetByRecordIdsMock,
		createMany: lossesRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/damagesRepository", () => ({
	DamagesRepository: {
		getByRecordIds: damagesRepositoryGetByRecordIdsMock,
		createMany: damagesRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/entityValidationAssignmentRepository", () => ({
	EntityValidationAssignmentRepository: {
		getByEntityIds: entityValidationAssignmentRepositoryGetByEntityIdsMock,
		createMany: entityValidationAssignmentRepositoryCreateManyMock,
	},
}));

vi.mock("~/db/queries/entityValidationRejectionRepository", () => ({
	EntityValidationRejectionRepository: {
		getByEntityIds: entityValidationRejectionRepositoryGetByEntityIdsMock,
		createMany: entityValidationRejectionRepositoryCreateManyMock,
	},
}));

describe("CountryAccountService.clone", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		countryAccountsRepositoryGetByIdWithCountryMock.mockResolvedValue({
			id: "source-ca",
			countryId: "country-1",
			status: "active",
			country: { type: "Fictional", iso3: "FIC" },
		});
		countryAccountsRepositoryCreateMock.mockResolvedValue({ id: "target-ca" });
		instanceSystemSettingRepositoryGetByCountryAccountIdMock.mockResolvedValue(null);
		instanceSystemSettingRepositoryCreateMock.mockResolvedValue({ id: "settings-1" });
		organizationRepositoryGetByCountryAccountsIdMock.mockResolvedValue([
			{ id: "old-org-1", countryAccountsId: "source-ca" },
		]);
		organizationRepositoryCreateManyMock.mockResolvedValue([]);
		userCountryAccountRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		humanDsgConfigRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		humanDsgConfigRepositoryCreateManyMock.mockResolvedValue([]);
		divisionRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		divisionRepositoryCreateManyMock.mockResolvedValue([]);
		assetRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		assetRepositoryCreateManyMock.mockResolvedValue([]);
		apiKeyRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		apiKeyRepositoryCreateManyMock.mockResolvedValue([]);
		hazardousEventRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		disasterEventRepositoryGetByCountryAccountsIdMock.mockResolvedValue([
			{
				id: "old-disaster-1",
				countryAccountsId: "source-ca",
				recordingOrganizationId: "old-org-1",
				hazardousEventId: null,
				disasterEventId: null,
			},
		]);
		eventRepositoryGetByIdsMock.mockResolvedValue([]);
		eventRepositoryCreateManyMock.mockResolvedValue([]);
		eventRelationshipRepositoryGetByEventIdsMock.mockResolvedValue([]);
		disasterEventRepositoryCreateManyMock.mockResolvedValue([]);
		disasterEventAttachmentRepositoryGetByDisasterEventIdsMock.mockResolvedValue([]);
		disasterEventLinkRepositoryGetByDisasterEventIdsMock.mockResolvedValue([]);
		disasterRecordsRepositoryGetByCountryAccountsIdMock.mockResolvedValue([]);
		disasterRecordsRepositoryCreateManyMock.mockResolvedValue([]);
		humanDsgRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		humanDsgRepositoryCreateManyMock.mockResolvedValue([]);
		affectedRepositoryGetByDsgIdsMock.mockResolvedValue([]);
		affectedRepositoryCreateManyMock.mockResolvedValue([]);
		displacedRepositoryGetByDsgIdsMock.mockResolvedValue([]);
		displacedRepositoryCreateManyMock.mockResolvedValue([]);
		deathRepositoryGetByDsgIdsMock.mockResolvedValue([]);
		deathRepositoryCreateManyMock.mockResolvedValue([]);
		missingRepositoryGetByDsgIdsMock.mockResolvedValue([]);
		missingRepositoryCreateManyMock.mockResolvedValue([]);
		injuredRepositoryGetByDsgIdsMock.mockResolvedValue([]);
		injuredRepositoryCreateManyMock.mockResolvedValue([]);
		disruptionRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		disruptionRepositoryCreateManyMock.mockResolvedValue([]);
		humanCategoryPresenceRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		humanCategoryPresenceRepositoryCreateManyMock.mockResolvedValue([]);
		nonEcoLossesRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		nonEcoLossesRepositoryCreateManyMock.mockResolvedValue([]);
		sectorDisasterRecordsRelationRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		sectorDisasterRecordsRelationRepositoryCreateManyMock.mockResolvedValue([]);
		lossesRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		lossesRepositoryCreateManyMock.mockResolvedValue([]);
		damagesRepositoryGetByRecordIdsMock.mockResolvedValue([]);
		damagesRepositoryCreateManyMock.mockResolvedValue([]);
		entityValidationAssignmentRepositoryGetByEntityIdsMock.mockResolvedValue([]);
		entityValidationAssignmentRepositoryCreateManyMock.mockResolvedValue([]);
		entityValidationRejectionRepositoryGetByEntityIdsMock.mockResolvedValue([]);
		entityValidationRejectionRepositoryCreateManyMock.mockResolvedValue([]);
		drTransactionMock.mockImplementation(async (cb) => cb({}));
	});

	it(
		"maps recording organization IDs when cloning disaster events into the new country account",
		async () => {
			const { CountryAccountService } = await import("~/services/countryAccountService");

			await CountryAccountService.clone("source-ca", "Training copy");

			const clonedRows = disasterEventRepositoryCreateManyMock.mock.calls[0][0];
			expect(clonedRows[0].recordingOrganizationId).not.toBe("old-org-1");
			expect(clonedRows[0].recordingOrganizationId).toEqual(expect.any(String));
		},
		20000,
	);
});
