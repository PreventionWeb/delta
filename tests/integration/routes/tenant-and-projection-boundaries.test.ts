import "../db/setup";
import { describe, it, expect, beforeAll } from "vitest";
import { RouterContextProvider } from "react-router";
import { eq } from "drizzle-orm";
import { dr } from "~/db.server";
import { BackendContext } from "~/backend.server/context";
import { createTranslationGetter } from "~/backend.server/translations";
import { initCookieStorage, sessionCookie } from "~/utils/session";
import { passwordHash } from "~/utils/passwordUtil";
import { userTable } from "~/drizzle/schema/userTable";
import { eventTable } from "../db/testSchema/eventTable";
import { eventRelationshipTable } from "../db/testSchema/eventRelationshipTable";
import { hazardousEventTable } from "../db/testSchema/hazardousEventTable";
import { disasterEventTable } from "../db/testSchema/disasterEventTable";
import { disasterRecordsTable } from "../db/testSchema/disasterRecordsTable";
import { damagesTable } from "../db/testSchema/damagesTable";
import { lossesTable } from "../db/testSchema/lossesTable";
import { disruptionTable } from "../db/testSchema/disruptionTable";
import { sectorTable } from "../db/testSchema/sectorTable";
import { assetTable } from "../db/testSchema/assetTable";
import { hipTypeTable } from "../db/testSchema/hipTypeTable";
import { apiKeyTable } from "../db/testSchema/apiKeyTable";
import { instanceSystemSettingsTable } from "../db/testSchema/instanceSystemSettingsTable";
import {
	countryAccounts,
	countryAccountStatuses,
} from "../db/testSchema/countryAccounts";
import {
	buildSessionCookie,
	insertTenant,
	insertUser,
} from "../domains/notices/testHelpers";
import {
	hazardousEventBasicInfoById,
	hazardousEventById,
	hazardousEventUpdateByIdAndCountryAccountsId,
	disasterEventUpdateByIdAndCountryAccountsId,
} from "~/backend.server/models/event";
import { disasterRecordsUpdate } from "~/backend.server/models/disaster_record";
import { assetUpdateByIdAndCountryAccountsId } from "~/backend.server/models/asset";
import { hazardousEventBasicInfoById as hazardousEventBasicInfoByIdAlt } from "~/backend.server/models/event/hazardous_event_get";
import { loader as hazardousEventViewLoader } from "~/routes/$lang+/hazardous-event+/$id";
import { loader as damagesCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/csv-export";
import { loader as lossesCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/losses+/csv-export";
import { loader as disruptionsCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/disruptions+/csv-export";
import { action as damagesCsvImportAction } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/csv-import";
import { action as lossesCsvImportAction } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/losses+/csv-import";
import { action as disruptionsCsvImportAction } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/disruptions+/csv-import";
import { loader as damagesListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/_index";
import { loader as lossesListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/losses+/_index";
import { loader as disruptionsListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/disruptions+/_index";
import {
	loader as sectorDeleteLoader,
	action as sectorDeleteAction,
} from "~/routes/$lang+/disaster-record+/edit-sec.$disRecId+/delete";
import { action as nonEcoWebAction } from "~/routes/$lang+/disaster-record+/non-economic-losses.$id+/_index";
import { action as apiNonecoAddAction } from "~/routes/$lang+/api+/nonecolosses+/add";
import { action as apiNonecoUpdateAction } from "~/routes/$lang+/api+/nonecolosses+/update";
import { action as apiNonecoUpsertAction } from "~/routes/$lang+/api+/nonecolosses+/upsert";
import { action as apiSectorRelAddAction } from "~/routes/$lang+/api+/sector-disaster-record-relation+/add";
import { action as apiSectorRelUpdateAction } from "~/routes/$lang+/api+/sector-disaster-record-relation+/update";
import { action as apiSectorRelUpsertAction } from "~/routes/$lang+/api+/sector-disaster-record-relation+/upsert";
import { action as apiDamageUpsertAction } from "~/routes/$lang+/api+/damage+/upsert";
import { action as apiLossesUpsertAction } from "~/routes/$lang+/api+/losses+/upsert";
import { action as apiDisruptionUpsertAction } from "~/routes/$lang+/api+/disruption+/upsert";
import { loader as spatialFootprintLoader } from "~/routes/$lang+/api+/spatial-footprint-geojson";
import { action as categoryPresenceSaveAction } from "~/routes/$lang+/api+/human-effects+/category-presence-save";
import { loader as getAssetsLoader } from "~/routes/$lang+/api+/asset+/getassets";
import { loader as contentPickerLoader } from "~/routes/$lang+/disaster-record+/content-picker-datasource";
import { loader as analyticsContentPickerLoader } from "~/routes/$lang+/analytics+/content-picker-datasource";
import { loader as tempViewerLoader } from "~/routes/$lang+/disaster-record+/file-temp-viewer";
import { loader as disasterEventViewLoader } from "~/routes/$lang+/disaster-event+/$id";
import { loader as analyticsDisasterEventsLoader } from "~/routes/$lang+/analytics+/disaster-events";
import { loader as analyticsSectorLoader } from "~/routes/$lang+/analytics+/disaster-events.sector";
import { action as analyticsHazardsAction } from "~/routes/$lang+/analytics+/hazards";
import {
	loadData as loadHumanEffectsData,
	saveHumanEffectsData,
} from "~/backend.server/handlers/human_effects";
import { action as humanEffectsIndexAction } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/human-effects+/_index";
import { action as humanEffectsCsvImportAction } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/human-effects+/csv-import";
import {
	damagesCreate,
	damagesIdByImportIdAndCountryAccountsId,
	damagesUpdateByIdAndCountryAccountsId,
} from "~/backend.server/models/damages";
import {
	lossesCreate,
	lossesIdByImportIdAndCountryAccountsId,
	lossesUpdateByIdAndCountryAccountsId,
} from "~/backend.server/models/losses";
import {
	disruptionCreate,
	disruptionIdByImportIdAndCountryAccountsId,
	disruptionUpdateByIdAndCountryAccountsId,
} from "~/backend.server/models/disruption";
import { humanDsgTable } from "../db/testSchema/humanDsgTable";
import { deathsTable } from "../db/testSchema/deathsTable";
import { sectorDisasterRecordsRelationTable } from "../db/testSchema/sectorDisasterRecordsRelationTable";
import { nonecoLossesTable } from "../db/testSchema/nonecoLossesTable";
import { categoriesTable } from "../db/testSchema/categoriesTable";

const FORBIDDEN_USER_KEYS = new Set([
	"password",
	"totpSecret",
	"totpSecretUrl",
	"inviteCode",
	"resetPasswordToken",
	"userSubmittedBy",
]);

function assertNoSensitiveFields(value: unknown, path = "root"): void {
	if (value === null || value === undefined || typeof value !== "object") {
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			assertNoSensitiveFields(item, `${path}[${index}]`),
		);
		return;
	}
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		expect(
			FORBIDDEN_USER_KEYS.has(key),
			`Unexpected field "${key}" at ${path}.${key}`,
		).toBe(false);
		assertNoSensitiveFields(nested, `${path}.${key}`);
	}
}

function makeArgs(
	url: string,
	params: Record<string, string> = {},
	headersInit: HeadersInit = {},
	init: RequestInit = {},
) {
	return {
		request: new Request(url, { ...init, headers: headersInit }),
		params: { lang: "en", ...params },
		context: new RouterContextProvider(),
		unstable_pattern: url,
	} as any;
}

describe("Tenant scoping and response projections", () => {
	beforeAll(() => {
		initCookieStorage();
		globalThis.createTranslationGetter = createTranslationGetter;
	});

	it("hazardous event loaders omit submitter user fields at all depths and filter unpublished relations for public callers", async () => {
		const tenantId = await insertTenant();
		await dr.insert(instanceSystemSettingsTable).values({
			countryAccountsId: tenantId,
			approvedRecordsArePublic: true,
		});

		const [submitter] = await dr
			.insert(userTable)
			.values({
				email: `submitter-${crypto.randomUUID()}@example.com`,
				password: passwordHash("SubmitterPass!123"),
				totpSecret: "SECRETBASE32KEY",
				totpSecretUrl: "otpauth://totp/delta?secret=SECRETBASE32KEY",
				inviteCode: "inv-secret-code",
				resetPasswordToken: "reset-digest-value",
				emailVerified: true,
			})
			.returning();

		const hipTypeId = `ht-${crypto.randomUUID().slice(0, 8)}`;
		await dr.insert(hipTypeTable).values({
			id: hipTypeId,
			name: { en: "Meteorological" },
		});

		const [parentEv] = await dr.insert(eventTable).values({}).returning();
		const [mainEv] = await dr.insert(eventTable).values({}).returning();
		const [pubChildEv] = await dr.insert(eventTable).values({}).returning();
		const [draftChildEv] = await dr.insert(eventTable).values({}).returning();

		await dr.insert(hazardousEventTable).values([
			{
				id: parentEv.id,
				countryAccountsId: tenantId,
				hipTypeId,
				approvalStatus: "draft",
				submittedByUserId: submitter.id,
			},
			{
				id: mainEv.id,
				countryAccountsId: tenantId,
				hipTypeId,
				approvalStatus: "published",
				submittedByUserId: submitter.id,
			},
			{
				id: pubChildEv.id,
				countryAccountsId: tenantId,
				hipTypeId,
				approvalStatus: "published",
				submittedByUserId: submitter.id,
			},
			{
				id: draftChildEv.id,
				countryAccountsId: tenantId,
				hipTypeId,
				approvalStatus: "draft",
				submittedByUserId: submitter.id,
			},
		]);

		await dr.insert(eventRelationshipTable).values([
			{ parentId: parentEv.id, childId: mainEv.id, type: "caused_by" },
			{ parentId: mainEv.id, childId: pubChildEv.id, type: "caused_by" },
			{ parentId: mainEv.id, childId: draftChildEv.id, type: "caused_by" },
		]);

		const ctx = new BackendContext({ params: { lang: "en" } } as any);
		const modelRes = await hazardousEventById(ctx, mainEv.id, tenantId);
		assertNoSensitiveFields(modelRes);

		const basicRes = await hazardousEventBasicInfoById(ctx, mainEv.id, tenantId);
		assertNoSensitiveFields(basicRes);

		const altBasicRes = await hazardousEventBasicInfoByIdAlt(
			ctx,
			mainEv.id,
			tenantId,
		);
		assertNoSensitiveFields(altBasicRes);

		// Authenticated tenant viewer response contains no user secret fields
		const viewerId = await insertUser();
		const viewerCookie = await buildSessionCookie({
			userId: viewerId,
			tenantId,
			role: "data-viewer",
		});
		const authLoaderRes = await hazardousEventViewLoader(
			makeArgs(
				`http://localhost:3000/en/hazardous-event/${mainEv.id}`,
				{ id: mainEv.id },
				{ Cookie: viewerCookie },
			),
		);
		assertNoSensitiveFields(authLoaderRes);
		expect(authLoaderRes.item.parent?.id).toBe(parentEv.id);
		expect(authLoaderRes.item.children).toHaveLength(2);

		// Public visitor sees only published relations (draft parent and draft child omitted)
		const anonSession = await sessionCookie().getSession();
		anonSession.set("countryAccountsId", tenantId);
		anonSession.set("countrySettings", { approvedRecordsArePublic: true });
		const anonCookie = (await sessionCookie().commitSession(anonSession)).split(
			";",
		)[0];
		const publicLoaderRes = await hazardousEventViewLoader(
			makeArgs(
				`http://localhost:3000/en/hazardous-event/${mainEv.id}`,
				{ id: mainEv.id },
				{ Cookie: anonCookie },
			),
		);
		assertNoSensitiveFields(publicLoaderRes);
		expect(publicLoaderRes.item.parent).toBeNull();
		expect(publicLoaderRes.item.children).toHaveLength(1);
		expect(publicLoaderRes.item.children[0].id).toBe(pubChildEv.id);
	});

	it("damages, losses, and disruptions CSV exports and lists enforce record and tenant boundaries", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();

		const [sector] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Housing" }, level: 1 })
			.returning();
		const [asset] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: true,
				builtInName: { en: "House" },
			})
			.returning();

		const [recA] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recA2] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "published" })
			.returning();

		const [dmgA] = await dr
			.insert(damagesTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				assetId: asset.id,
				totalDamageAmount: 10,
			})
			.returning();
		const [dmgA2] = await dr
			.insert(damagesTable)
			.values({
				recordId: recA2.id,
				sectorId: sector.id,
				assetId: asset.id,
				totalDamageAmount: 20,
			})
			.returning();
		const [dmgB] = await dr
			.insert(damagesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				assetId: asset.id,
				totalDamageAmount: 99,
			})
			.returning();

		const [lossA] = await dr
			.insert(lossesTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
				description: "TenantA-Loss",
			})
			.returning();
		const [lossA2] = await dr
			.insert(lossesTable)
			.values({
				recordId: recA2.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
				description: "TenantA2-Loss",
			})
			.returning();
		const [lossB] = await dr
			.insert(lossesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
				description: "TenantB-Loss",
			})
			.returning();

		const [disA] = await dr
			.insert(disruptionTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				comment: "TenantA-Disruption",
			})
			.returning();
		const [disA2] = await dr
			.insert(disruptionTable)
			.values({
				recordId: recA2.id,
				sectorId: sector.id,
				comment: "TenantA2-Disruption",
			})
			.returning();
		const [disB] = await dr
			.insert(disruptionTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				comment: "TenantB-Disruption",
			})
			.returning();

		const userA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: userA,
			tenantId: tenantA,
			role: "data-viewer",
		});

		// Own-tenant CSV exports return only recA rows (excluding both recA2 and recB)
		const dmgRes = await damagesCsvLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/damages/csv-export`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
			),
		);
		expect(dmgRes.status).toBe(200);
		expect(dmgRes.headers.get("Cache-Control")).toBe("private, no-store");
		const dmgCsv = await dmgRes.text();
		expect(dmgCsv).toContain(dmgA.id);
		expect(dmgCsv).not.toContain(dmgA2.id);
		expect(dmgCsv).not.toContain(dmgB.id);

		const lossRes = await lossesCsvLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/losses/csv-export`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
			),
		);
		expect(lossRes.status).toBe(200);
		expect(lossRes.headers.get("Cache-Control")).toBe("private, no-store");
		const lossCsv = await lossRes.text();
		expect(lossCsv).toContain(lossA.id);
		expect(lossCsv).not.toContain(lossA2.id);
		expect(lossCsv).not.toContain(lossB.id);

		const disRes = await disruptionsCsvLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/disruptions/csv-export`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
			),
		);
		expect(disRes.status).toBe(200);
		expect(disRes.headers.get("Cache-Control")).toBe("private, no-store");
		const disCsv = await disRes.text();
		expect(disCsv).toContain(disA.id);
		expect(disCsv).not.toContain(disA2.id);
		expect(disCsv).not.toContain(disB.id);

		// Foreign tenant disRecId returns 404 on all three CSV exports and list pages
		for (const [loaderFn, pathSuffix] of [
			[damagesCsvLoader, "damages/csv-export"],
			[lossesCsvLoader, "losses/csv-export"],
			[disruptionsCsvLoader, "disruptions/csv-export"],
			[damagesListLoader, `damages?sectorId=${sector.id}`],
			[lossesListLoader, `losses?sectorId=${sector.id}`],
			[disruptionsListLoader, `disruptions?sectorId=${sector.id}`],
		] as const) {
			let thrown: unknown;
			try {
				await loaderFn(
					makeArgs(
						`http://localhost:3000/en/disaster-record/edit-sub/${recB.id}/${pathSuffix}`,
						{ disRecId: recB.id },
						{ Cookie: cookieA },
					),
				);
			} catch (e) {
				thrown = e;
			}
			expect(thrown).toBeInstanceOf(Response);
			expect((thrown as Response).status).toBe(404);
		}
	});

	it("API key routes reject unknown tokens, cross-tenant IDs, and inactive-tenant keys", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const adminB = await insertUser();

		const secretB = `key-b-${crypto.randomUUID()}`;
		await dr.insert(apiKeyTable).values({
			name: "Tenant B Key",
			secret: secretB,
			managedByUserId: adminB,
			countryAccountsId: tenantB,
		});

		const [recA] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantA,
				approvalStatus: "published",
				spatialFootprint: [
					{
						geojson: {
							type: "Feature",
							properties: { division_id: "div-x" },
							geometry: { type: "Point", coordinates: [10, 20] },
						},
					},
				],
			})
			.returning();

		// Unknown X-Auth token returns 401 on route wrapper
		let thrownUnknown: unknown;
		try {
			await spatialFootprintLoader(
				makeArgs(
					`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=div-x&record_id=${recA.id}`,
					{},
					{ "X-Auth": "unknown-api-key-value" },
				),
			);
		} catch (e) {
			thrownUnknown = e;
		}
		expect(thrownUnknown).toBeInstanceOf(Response);
		expect((thrownUnknown as Response).status).toBe(401);

		// Valid Tenant B API key requesting Tenant A record returns 404
		const crossRes = await spatialFootprintLoader(
			makeArgs(
				`http://localhost:3000/en/api/spatial-footprint-geojson?division_id=div-x&record_id=${recA.id}`,
				{},
				{ "X-Auth": secretB },
			),
		);
		expect(crossRes.status).toBe(404);

		// Valid Tenant B API key writing category presence on Tenant A record returns 404
		let thrownWrite: unknown;
		try {
			await categoryPresenceSaveAction(
				makeArgs(
					`http://localhost:3000/en/api/human-effects/category-presence-save?recordId=${recA.id}`,
					{},
					{ "X-Auth": secretB, "Content-Type": "application/json" },
					{
						method: "POST",
						body: JSON.stringify({ table: "Deaths", data: { deaths: true } }),
					},
				),
			);
		} catch (e) {
			thrownWrite = e;
		}
		expect(thrownWrite).toBeInstanceOf(Response);
		expect((thrownWrite as Response).status).toBe(404);

		// Deactivating Tenant B causes Tenant B's API key to be rejected with 403
		await dr
			.update(countryAccounts)
			.set({ status: countryAccountStatuses.INACTIVE })
			.where(eq(countryAccounts.id, tenantB));

		let thrownInactive: unknown;
		try {
			await categoryPresenceSaveAction(
				makeArgs(
					`http://localhost:3000/en/api/human-effects/category-presence-save?recordId=${recA.id}`,
					{},
					{ "X-Auth": secretB, "Content-Type": "application/json" },
					{
						method: "POST",
						body: JSON.stringify({ table: "Deaths", data: { deaths: true } }),
					},
				),
			);
		} catch (e) {
			thrownInactive = e;
		}
		expect(thrownInactive).toBeInstanceOf(Response);
		expect((thrownInactive as Response).status).toBe(403);
	});

	it("asset search, public content picker, and temp file viewer enforce tenant and visibility rules", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();

		await dr.insert(instanceSystemSettingsTable).values({
			countryAccountsId: tenantA,
			approvedRecordsArePublic: true,
		});

		const tag = crypto.randomUUID().slice(0, 8);
		await dr.insert(assetTable).values([
			{
				sectorIds: "1",
				isBuiltIn: true,
				builtInName: { en: `BuiltIn-${tag}` },
			},
			{
				sectorIds: "1",
				isBuiltIn: false,
				customName: `CustomA-${tag}`,
				countryAccountsId: tenantA,
			},
			{
				sectorIds: "1",
				isBuiltIn: false,
				customName: `CustomB-${tag}`,
				countryAccountsId: tenantB,
			},
		]);

		const userA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: userA,
			tenantId: tenantA,
			role: "data-viewer",
		});

		const assetRes = await getAssetsLoader(
			makeArgs(
				`http://localhost:3000/en/api/asset/getassets?q=${tag}`,
				{},
				{ Cookie: cookieA },
			),
		);
		expect(assetRes.status).toBe(200);
		const assetRows = (await assetRes.json()) as Array<{ name: string }>;
		const assetNames = assetRows.map((a) => a.name);
		expect(assetNames).toContain(`BuiltIn-${tag}`);
		expect(assetNames).toContain(`CustomA-${tag}`);
		expect(assetNames).not.toContain(`CustomB-${tag}`);

		// Public content picker filters to session tenant + published disaster events only
		const [evPubA] = await dr.insert(eventTable).values({}).returning();
		const [evDraftA] = await dr.insert(eventTable).values({}).returning();
		const [evPubB] = await dr.insert(eventTable).values({}).returning();
		await dr.insert(disasterEventTable).values([
			{
				id: evPubA.id,
				countryAccountsId: tenantA,
				nameNational: `PickerPubA-${tag}`,
				approvalStatus: "published",
			},
			{
				id: evDraftA.id,
				countryAccountsId: tenantA,
				nameNational: `PickerDraftA-${tag}`,
				approvalStatus: "draft",
			},
			{
				id: evPubB.id,
				countryAccountsId: tenantB,
				nameNational: `PickerPubB-${tag}`,
				approvalStatus: "published",
			},
		]);

		const anonSession = await sessionCookie().getSession();
		anonSession.set("countryAccountsId", tenantA);
		anonSession.set("countrySettings", { approvedRecordsArePublic: true });
		const anonCookie = (await sessionCookie().commitSession(anonSession)).split(
			";",
		)[0];

		const pickerRes = await contentPickerLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-record/content-picker-datasource?query=${tag}&view=0`,
				{},
				{ Cookie: anonCookie },
			),
		);
		expect(pickerRes.status).toBe(200);
		const pickerBody = (await pickerRes.json()) as {
			data: Array<Record<string, unknown>>;
			totalRecords: number;
		};
		expect(pickerBody.totalRecords).toBe(1);
		expect(pickerBody.data).toHaveLength(1);
		const serializedPicker = JSON.stringify(pickerBody.data);
		expect(serializedPicker).toContain(`PickerPubA-${tag}`);
		expect(serializedPicker).not.toContain(`PickerDraftA-${tag}`);
		expect(serializedPicker).not.toContain(`PickerPubB-${tag}`);

		// Temp file viewer requires authentication even when tenant has public records enabled
		let thrownTemp: unknown;
		try {
			await tempViewerLoader(
				makeArgs(
					"http://localhost:3000/en/disaster-record/file-temp-viewer?name=temp.pdf",
					{},
					{ Cookie: anonCookie },
				),
			);
		} catch (e) {
			thrownTemp = e;
		}
		expect(thrownTemp).toBeInstanceOf(Response);
		expect((thrownTemp as Response).status).toBe(302);
		expect((thrownTemp as Response).headers.get("Location")).toContain(
			"/en/user/login",
		);
	});

	it("human-effects reads and writes enforce record ownership and row-to-record binding", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const ctx = new BackendContext({ params: { lang: "en" } } as any);

		const [recA] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "draft" })
			.returning();

		// Seed a human-effects death row belonging to Tenant B
		const [dsgB] = await dr
			.insert(humanDsgTable)
			.values({ recordId: recB.id })
			.returning();
		const [deathB] = await dr
			.insert(deathsTable)
			.values({ dsgId: dsgB.id, deaths: 42 })
			.returning();

		// 1. loadData rejects foreign record with 404
		let thrownLoad: unknown;
		try {
			await loadHumanEffectsData(ctx, recB.id, "Deaths", tenantA);
		} catch (e) {
			thrownLoad = e;
		}
		expect(thrownLoad).toBeInstanceOf(Response);
		expect((thrownLoad as Response).status).toBe(404);

		// 2. saveHumanEffectsData rejects foreign record with 404
		let thrownSaveForeign: unknown;
		try {
			await saveHumanEffectsData(
				ctx,
				new Request("http://localhost:3000/en/save", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						table: "Deaths",
						columns: ["sex", "age", "disability", "globalPovertyLine", "nationalPovertyLine", "deaths"],
						data: { deletes: [deathB.id] },
					}),
				}),
				recB.id,
				tenantA,
			);
		} catch (e) {
			thrownSaveForeign = e;
		}
		expect(thrownSaveForeign).toBeInstanceOf(Response);
		expect((thrownSaveForeign as Response).status).toBe(404);

		// 3. saveHumanEffectsData on own record cannot delete a row ID belonging to another tenant's record
		const ownData = await loadHumanEffectsData(ctx, recA.id, "Deaths", tenantA);
		const cols = ownData.defs.map((d) => d.jsName);
		const deleteRes = await saveHumanEffectsData(
			ctx,
			new Request("http://localhost:3000/en/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					table: "Deaths",
					columns: cols,
					data: { deletes: [deathB.id] },
				}),
			}),
			recA.id,
			tenantA,
		);
		const deleteBody = (await deleteRes.json()) as { ok: boolean };
		expect(deleteBody.ok).toBe(false);

		// Verify Tenant B's death row is untouched
		const [stillThere] = await dr
			.select()
			.from(deathsTable)
			.where(eq(deathsTable.id, deathB.id));
		expect(stillThere?.deaths).toBe(42);

		// 3b. saveHumanEffectsData on own record cannot update a foreign row ID, while own create+update succeeds
		const deathsColIdx = cols.indexOf("deaths");
		const updateRowValues = cols.map((_, idx) =>
			idx === deathsColIdx ? 99 : null,
		);
		const badUpdateRes = await saveHumanEffectsData(
			ctx,
			new Request("http://localhost:3000/en/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					table: "Deaths",
					columns: cols,
					data: { updates: { [deathB.id]: updateRowValues } },
				}),
			}),
			recA.id,
			tenantA,
		);
		expect(((await badUpdateRes.json()) as { ok: boolean }).ok).toBe(false);
		const [stillUnmodified] = await dr
			.select()
			.from(deathsTable)
			.where(eq(deathsTable.id, deathB.id));
		expect(stillUnmodified?.deaths).toBe(42);

		const newRowValues = cols.map((_, idx) =>
			idx === deathsColIdx ? 7 : null,
		);
		const ownCreateRes = await saveHumanEffectsData(
			ctx,
			new Request("http://localhost:3000/en/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					table: "Deaths",
					columns: cols,
					data: { newRows: { _temp1: newRowValues } },
				}),
			}),
			recA.id,
			tenantA,
		);
		expect(((await ownCreateRes.json()) as { ok: boolean }).ok).toBe(true);
		const ownAfterCreate = await loadHumanEffectsData(
			ctx,
			recA.id,
			"Deaths",
			tenantA,
		);
		expect(ownAfterCreate.ids.length).toBe(1);
		const ownUpdateRes = await saveHumanEffectsData(
			ctx,
			new Request("http://localhost:3000/en/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					table: "Deaths",
					columns: cols,
					data: { updates: { [ownAfterCreate.ids[0]]: updateRowValues } },
				}),
			}),
			recA.id,
			tenantA,
		);
		expect(((await ownUpdateRes.json()) as { ok: boolean }).ok).toBe(true);
		const [ownDeathAfter] = await dr
			.select()
			.from(deathsTable)
			.where(eq(deathsTable.id, ownAfterCreate.ids[0]));
		expect(ownDeathAfter?.deaths).toBe(99);

		// 4. Web human-effects index action & csv-import action reject foreign record with 404
		const editorA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: editorA,
			tenantId: tenantA,
			role: "admin",
		});

		const idxForm = new FormData();
		idxForm.append("tblId", "Deaths");
		idxForm.append("deaths", "1");
		let thrownIdx: unknown;
		try {
			await humanEffectsIndexAction(
				makeArgs(
					`http://localhost:3000/en/disaster-record/edit-sub/${recB.id}/human-effects`,
					{ disRecId: recB.id },
					{ Cookie: cookieA },
					{ method: "POST", body: idxForm },
				),
			);
		} catch (e) {
			thrownIdx = e;
		}
		expect(thrownIdx).toBeInstanceOf(Response);
		expect((thrownIdx as Response).status).toBe(404);

		const csvForm = new FormData();
		csvForm.append("tableId", "Deaths");
		csvForm.append(
			"file",
			new File([`${cols.join(",")}\n,,,,,10\n`], "deaths.csv", {
				type: "text/csv",
			}),
		);
		let thrownCsv: unknown;
		try {
			await humanEffectsCsvImportAction(
				makeArgs(
					`http://localhost:3000/en/disaster-record/edit-sub/${recB.id}/human-effects/csv-import`,
					{ disRecId: recB.id },
					{ Cookie: cookieA },
					{ method: "POST", body: csvForm },
				),
			);
		} catch (e) {
			thrownCsv = e;
		}
		expect(thrownCsv).toBeInstanceOf(Response);
		expect((thrownCsv as Response).status).toBe(404);
	});

	it("damages, losses, and disruptions writes prevent cross-tenant create, update, re-parenting, and import lookup", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const ctx = new BackendContext({ params: { lang: "en" } } as any);

		const [sector] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Transport" }, level: 1 })
			.returning();
		const [asset] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: true,
				builtInName: { en: "Road" },
			})
			.returning();

		const [recA] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "draft" })
			.returning();

		const impDmg = `imp-dmg-${crypto.randomUUID()}`;
		const impLoss = `imp-loss-${crypto.randomUUID()}`;
		const impDis = `imp-dis-${crypto.randomUUID()}`;

		const [dmgA] = await dr
			.insert(damagesTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				assetId: asset.id,
				apiImportId: impDmg,
				totalDamageAmount: 5,
			})
			.returning();
		const [dmgB] = await dr
			.insert(damagesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				assetId: asset.id,
				totalDamageAmount: 50,
			})
			.returning();

		const [lossA] = await dr
			.insert(lossesTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
				apiImportId: impLoss,
			})
			.returning();
		const [lossB] = await dr
			.insert(lossesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			})
			.returning();

		const [disA] = await dr
			.insert(disruptionTable)
			.values({
				recordId: recA.id,
				sectorId: sector.id,
				apiImportId: impDis,
			})
			.returning();
		const [disB] = await dr
			.insert(disruptionTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
			})
			.returning();

		// Import ID lookups are tenant-scoped through recordId
		expect(
			await damagesIdByImportIdAndCountryAccountsId(dr, impDmg, tenantA),
		).toBe(dmgA.id);
		expect(
			await damagesIdByImportIdAndCountryAccountsId(dr, impDmg, tenantB),
		).toBeNull();
		expect(
			await lossesIdByImportIdAndCountryAccountsId(dr, impLoss, tenantA),
		).toBe(lossA.id);
		expect(
			await lossesIdByImportIdAndCountryAccountsId(dr, impLoss, tenantB),
		).toBeNull();
		expect(
			await disruptionIdByImportIdAndCountryAccountsId(dr, impDis, tenantA),
		).toBe(disA.id);
		expect(
			await disruptionIdByImportIdAndCountryAccountsId(dr, impDis, tenantB),
		).toBeNull();

		// Creating under a foreign tenant's recordId is rejected
		const badDmgCreate = await damagesCreate(
			ctx,
			dr,
			{
				recordId: recB.id,
				sectorId: sector.id,
				assetId: asset.id,
			} as any,
			tenantA,
		);
		expect(badDmgCreate.ok).toBe(false);

		const badLossCreate = await lossesCreate(
			ctx,
			dr,
			{
				recordId: recB.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			} as any,
			tenantA,
		);
		expect(badLossCreate.ok).toBe(false);

		const badDisCreate = await disruptionCreate(
			ctx,
			dr,
			{
				recordId: recB.id,
				sectorId: sector.id,
			} as any,
			tenantA,
		);
		expect(badDisCreate.ok).toBe(false);

		// Updating a foreign row or re-parenting own row to a foreign recordId is rejected
		const badDmgUpdate = await damagesUpdateByIdAndCountryAccountsId(
			ctx,
			dr,
			dmgB.id,
			tenantA,
			{ recordId: recA.id },
		);
		expect(badDmgUpdate.ok).toBe(false);

		const badDmgReparent = await damagesUpdateByIdAndCountryAccountsId(
			ctx,
			dr,
			dmgA.id,
			tenantA,
			{ recordId: recB.id },
		);
		expect(badDmgReparent.ok).toBe(false);

		const badLossReparent = await lossesUpdateByIdAndCountryAccountsId(
			ctx,
			dr,
			lossA.id,
			tenantA,
			{ recordId: recB.id },
		);
		expect(badLossReparent.ok).toBe(false);
		expect(
			(
				await lossesUpdateByIdAndCountryAccountsId(
					ctx,
					dr,
					lossB.id,
					tenantA,
					{ recordId: recA.id },
				)
			).ok,
		).toBe(false);

		const badDisReparent = await disruptionUpdateByIdAndCountryAccountsId(
			ctx,
			dr,
			disA.id,
			tenantA,
			{ recordId: recB.id },
		);
		expect(badDisReparent.ok).toBe(false);
		expect(
			(
				await disruptionUpdateByIdAndCountryAccountsId(
					ctx,
					dr,
					disB.id,
					tenantA,
					{ recordId: recA.id },
				)
			).ok,
		).toBe(false);

		// Confirm foreign damage row was not re-parented
		const [dmgBAfter] = await dr
			.select()
			.from(damagesTable)
			.where(eq(damagesTable.id, dmgB.id));
		expect(dmgBAfter.recordId).toBe(recB.id);
	});

	it("analytics routes and public disaster-event view enforce tenant scoping and publication status", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();

		await dr.insert(instanceSystemSettingsTable).values([
			{ countryAccountsId: tenantA, approvedRecordsArePublic: true },
			{ countryAccountsId: tenantB, approvedRecordsArePublic: false },
		]);

		const hipTypeId = `ht-an-${crypto.randomUUID().slice(0, 8)}`;
		await dr.insert(hipTypeTable).values({
			id: hipTypeId,
			name: { en: "Hydrological" },
		});

		const [draftHeEv] = await dr.insert(eventTable).values({}).returning();
		const [pubDeEvA] = await dr.insert(eventTable).values({}).returning();
		const [draftDeEvA] = await dr.insert(eventTable).values({}).returning();
		const [pubDeEvB] = await dr.insert(eventTable).values({}).returning();

		await dr.insert(hazardousEventTable).values({
			id: draftHeEv.id,
			countryAccountsId: tenantA,
			hipTypeId,
			approvalStatus: "draft",
		});

		await dr.insert(disasterEventTable).values([
			{
				id: pubDeEvA.id,
				countryAccountsId: tenantA,
				hazardousEventId: draftHeEv.id,
				nameNational: "Published Event A",
				approvalStatus: "published",
			},
			{
				id: draftDeEvA.id,
				countryAccountsId: tenantA,
				nameNational: "Draft Event A",
				approvalStatus: "draft",
			},
			{
				id: pubDeEvB.id,
				countryAccountsId: tenantB,
				nameNational: "Published Event B",
				approvalStatus: "published",
			},
		]);

		const [pubRecA] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantA,
				disasterEventId: pubDeEvA.id,
				approvalStatus: "published",
			})
			.returning();
		const [draftRecA] = await dr
			.insert(disasterRecordsTable)
			.values({
				countryAccountsId: tenantA,
				disasterEventId: pubDeEvA.id,
				approvalStatus: "draft",
			})
			.returning();

		const [sector] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Energy" }, level: 1 })
			.returning();

		const anonSessionA = await sessionCookie().getSession();
		anonSessionA.set("countryAccountsId", tenantA);
		anonSessionA.set("countrySettings", {
			approvedRecordsArePublic: true,
			currencyCode: "USD",
		});
		const anonCookieA = (
			await sessionCookie().commitSession(anonSessionA)
		).split(";")[0];

		// 1. Public disaster-event detail view omits draft linked hazardous event and draft disaster record
		const deViewRes = await disasterEventViewLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-event/${pubDeEvA.id}`,
				{ id: pubDeEvA.id },
				{ Cookie: anonCookieA },
			),
		);
		expect(deViewRes.item.hazardousEvent).toBeUndefined();
		const linkedRecIds = deViewRes.item.linkedDisasterRecords.map(
			(r: { id: string }) => r.id,
		);
		expect(linkedRecIds).toContain(pubRecA.id);
		expect(linkedRecIds).not.toContain(draftRecA.id);

		// 2. Public analytics/disaster-events returns 404 for unpublished disaster event
		let thrownAnalyticsDraft: unknown;
		try {
			await analyticsDisasterEventsLoader(
				makeArgs(
					`http://localhost:3000/en/analytics/disaster-events?disasterEventId=${draftDeEvA.id}`,
					{},
					{ Cookie: anonCookieA },
				),
			);
		} catch (e) {
			thrownAnalyticsDraft = e;
		}
		expect(thrownAnalyticsDraft).toBeInstanceOf(Response);
		expect((thrownAnalyticsDraft as Response).status).toBe(404);

		// 3. Sector analytics returns 404 for another tenant's event (even when authenticated)
		const userA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: userA,
			tenantId: tenantA,
			role: "data-viewer",
		});
		let thrownSectorForeign: unknown;
		try {
			await analyticsSectorLoader(
				makeArgs(
					`http://localhost:3000/en/analytics/disaster-events/sector?disasterEventId=${pubDeEvB.id}&sectorid=${sector.id}`,
					{},
					{ Cookie: cookieA },
				),
			);
		} catch (e) {
			thrownSectorForeign = e;
		}
		expect(thrownSectorForeign).toBeInstanceOf(Response);
		expect((thrownSectorForeign as Response).status).toBe(404);

		// 4. Sector analytics returns 404 for unpublished event on public path
		let thrownSectorDraft: unknown;
		try {
			await analyticsSectorLoader(
				makeArgs(
					`http://localhost:3000/en/analytics/disaster-events/sector?disasterEventId=${draftDeEvA.id}&sectorid=${sector.id}`,
					{},
					{ Cookie: anonCookieA },
				),
			);
		} catch (e) {
			thrownSectorDraft = e;
		}
		expect(thrownSectorDraft).toBeInstanceOf(Response);
		expect((thrownSectorDraft as Response).status).toBe(404);

		// 5. Hazards analytics action redirects unauthenticated requests when tenant is private
		const anonSessionB = await sessionCookie().getSession();
		anonSessionB.set("countryAccountsId", tenantB);
		anonSessionB.set("countrySettings", { approvedRecordsArePublic: false });
		const anonCookieB = (
			await sessionCookie().commitSession(anonSessionB)
		).split(";")[0];

		let thrownHazards: unknown;
		try {
			await analyticsHazardsAction(
				makeArgs(
					"http://localhost:3000/en/analytics/hazards",
					{},
					{ Cookie: anonCookieB },
					{ method: "POST", body: new FormData() },
				),
			);
		} catch (e) {
			thrownHazards = e;
		}
		expect(thrownHazards).toBeInstanceOf(Response);
		expect((thrownHazards as Response).status).toBe(302);
		expect((thrownHazards as Response).headers.get("Location")).toContain(
			"/en/user/login",
		);

		// 6. Public analytics picker lists only published events for the session tenant, and positive analytics queries succeed
		const [valDeEvA] = await dr.insert(eventTable).values({}).returning();
		await dr.insert(disasterEventTable).values({
			id: valDeEvA.id,
			countryAccountsId: tenantA,
			nameNational: "Validated Event A",
			approvalStatus: "validated",
		});

		const publicPickerRes = await analyticsContentPickerLoader(
			makeArgs(
				"http://localhost:3000/en/analytics/content-picker-datasource?query=&page=1&limit=20",
				{},
				{ Cookie: anonCookieA },
			),
		);
		const publicPickerBody = (await publicPickerRes.json()) as {
			data: Array<{ _CpID: string }>;
		};
		const publicPickerIds = publicPickerBody.data.map((row) => row._CpID);
		expect(publicPickerIds).toContain(pubDeEvA.id);
		expect(publicPickerIds).not.toContain(valDeEvA.id);
		expect(publicPickerIds).not.toContain(draftDeEvA.id);
		expect(publicPickerIds).not.toContain(pubDeEvB.id);

		const pubAnalyticsRes = await analyticsDisasterEventsLoader(
			makeArgs(
				`http://localhost:3000/en/analytics/disaster-events?disasterEventId=${pubDeEvA.id}`,
				{},
				{ Cookie: anonCookieA },
			),
		);
		expect(pubAnalyticsRes).not.toBeInstanceOf(Response);
		if (!(pubAnalyticsRes instanceof Response)) {
			expect(pubAnalyticsRes.record?.id).toBe(pubDeEvA.id);
			expect(pubAnalyticsRes.record?.hazardousEvent).toBeUndefined();
		}

		const pubSectorRes = await analyticsSectorLoader(
			makeArgs(
				`http://localhost:3000/en/analytics/disaster-events/sector?disasterEventId=${pubDeEvA.id}&sectorid=${sector.id}`,
				{},
				{ Cookie: anonCookieA },
			),
		);
		expect(pubSectorRes.sectorData?.id).toBe(sector.id);
	});

	it("sector deletion removes only the target record's sector rows and requires POST", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const editorA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: editorA,
			tenantId: tenantA,
			role: "admin",
		});

		const [sector] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Housing" }, level: 1 })
			.returning();
		const [asset] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: true,
				builtInName: { en: "House" },
			})
			.returning();

		const [recA1] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recA2] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB1] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "draft" })
			.returning();

		const [relA1] = await dr
			.insert(sectorDisasterRecordsRelationTable)
			.values({
				disasterRecordId: recA1.id,
				sectorId: sector.id,
				withDamage: true,
				withLosses: true,
				withDisruption: true,
			})
			.returning();
		const [relA2] = await dr
			.insert(sectorDisasterRecordsRelationTable)
			.values({
				disasterRecordId: recA2.id,
				sectorId: sector.id,
				withDamage: true,
			})
			.returning();
		const [relB1] = await dr
			.insert(sectorDisasterRecordsRelationTable)
			.values({
				disasterRecordId: recB1.id,
				sectorId: sector.id,
				withDamage: true,
			})
			.returning();

		const [dmgA1] = await dr
			.insert(damagesTable)
			.values({ recordId: recA1.id, sectorId: sector.id, assetId: asset.id })
			.returning();
		const [dmgA2] = await dr
			.insert(damagesTable)
			.values({ recordId: recA2.id, sectorId: sector.id, assetId: asset.id })
			.returning();
		const [dmgB1] = await dr
			.insert(damagesTable)
			.values({ recordId: recB1.id, sectorId: sector.id, assetId: asset.id })
			.returning();

		const [lossA1] = await dr
			.insert(lossesTable)
			.values({
				recordId: recA1.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			})
			.returning();
		const [lossA2] = await dr
			.insert(lossesTable)
			.values({
				recordId: recA2.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			})
			.returning();
		const [lossB1] = await dr
			.insert(lossesTable)
			.values({
				recordId: recB1.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			})
			.returning();

		const [disA1] = await dr
			.insert(disruptionTable)
			.values({ recordId: recA1.id, sectorId: sector.id })
			.returning();
		const [disA2] = await dr
			.insert(disruptionTable)
			.values({ recordId: recA2.id, sectorId: sector.id })
			.returning();
		const [disB1] = await dr
			.insert(disruptionTable)
			.values({ recordId: recB1.id, sectorId: sector.id })
			.returning();

		// GET loader rejects with 405 and leaves all rows intact
		const getRes = await sectorDeleteLoader(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sec/${recA1.id}/delete?id=${relA1.id}`,
				{ disRecId: recA1.id },
				{ Cookie: cookieA },
			),
		);
		expect(getRes.status).toBe(405);

		// POST with foreign tenant's or another record's relation ID returns 404
		const foreignRes = await sectorDeleteAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sec/${recA1.id}/delete?id=${relB1.id}`,
				{ disRecId: recA1.id },
				{ Cookie: cookieA },
				{ method: "POST" },
			),
		);
		expect(foreignRes.status).toBe(404);

		const mismatchRes = await sectorDeleteAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sec/${recA1.id}/delete?id=${relA2.id}`,
				{ disRecId: recA1.id },
				{ Cookie: cookieA },
				{ method: "POST" },
			),
		);
		expect(mismatchRes.status).toBe(404);

		// POST for recA1 deletes only recA1's rows; recA2 and recB1 rows remain intact
		const okRes = await sectorDeleteAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sec/${recA1.id}/delete?id=${relA1.id}`,
				{ disRecId: recA1.id },
				{ Cookie: cookieA },
				{ method: "POST" },
			),
		);
		expect(okRes.status).toBe(302);

		expect(
			await dr.select().from(damagesTable).where(eq(damagesTable.id, dmgA1.id)),
		).toHaveLength(0);
		expect(
			await dr.select().from(lossesTable).where(eq(lossesTable.id, lossA1.id)),
		).toHaveLength(0);
		expect(
			await dr
				.select()
				.from(disruptionTable)
				.where(eq(disruptionTable.id, disA1.id)),
		).toHaveLength(0);
		expect(
			await dr
				.select()
				.from(sectorDisasterRecordsRelationTable)
				.where(eq(sectorDisasterRecordsRelationTable.id, relA1.id)),
		).toHaveLength(0);

		expect(
			await dr.select().from(damagesTable).where(eq(damagesTable.id, dmgA2.id)),
		).toHaveLength(1);
		expect(
			await dr.select().from(damagesTable).where(eq(damagesTable.id, dmgB1.id)),
		).toHaveLength(1);
		expect(
			await dr.select().from(lossesTable).where(eq(lossesTable.id, lossA2.id)),
		).toHaveLength(1);
		expect(
			await dr.select().from(lossesTable).where(eq(lossesTable.id, lossB1.id)),
		).toHaveLength(1);
		expect(
			await dr
				.select()
				.from(disruptionTable)
				.where(eq(disruptionTable.id, disA2.id)),
		).toHaveLength(1);
		expect(
			await dr
				.select()
				.from(disruptionTable)
				.where(eq(disruptionTable.id, disB1.id)),
		).toHaveLength(1);
		expect(
			await dr
				.select()
				.from(sectorDisasterRecordsRelationTable)
				.where(eq(sectorDisasterRecordsRelationTable.id, relA2.id)),
		).toHaveLength(1);
		expect(
			await dr
				.select()
				.from(sectorDisasterRecordsRelationTable)
				.where(eq(sectorDisasterRecordsRelationTable.id, relB1.id)),
		).toHaveLength(1);
	});

	it("non-economic losses and sector relations routes enforce tenant ownership on add, update, upsert, and web actions", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const adminA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: adminA,
			tenantId: tenantA,
			role: "admin",
		});

		const secretA = `key-a-${crypto.randomUUID()}`;
		await dr.insert(apiKeyTable).values({
			name: "Tenant A Key",
			secret: secretA,
			managedByUserId: adminA,
			countryAccountsId: tenantA,
		});

		const [cat] = await dr
			.insert(categoriesTable)
			.values({ name: { en: "Cultural" }, level: 1 })
			.returning();
		const [cat2] = await dr
			.insert(categoriesTable)
			.values({ name: { en: "Environmental" }, level: 1 })
			.returning();
		const [cat3] = await dr
			.insert(categoriesTable)
			.values({ name: { en: "Social" }, level: 1 })
			.returning();
		const [cat4] = await dr
			.insert(categoriesTable)
			.values({ name: { en: "Heritage" }, level: 1 })
			.returning();
		const [sec1] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Water" }, level: 1 })
			.returning();
		const [sec2] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Health" }, level: 1 })
			.returning();

		const [recA1] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recA2] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB1] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "draft" })
			.returning();

		const [nonecoA] = await dr
			.insert(nonecoLossesTable)
			.values({
				disasterRecordId: recA1.id,
				categoryId: cat.id,
				description: "Tenant A initial",
			})
			.returning();
		const [nonecoB] = await dr
			.insert(nonecoLossesTable)
			.values({
				disasterRecordId: recB1.id,
				categoryId: cat.id,
				description: "Tenant B original",
			})
			.returning();

		const [secRelA] = await dr
			.insert(sectorDisasterRecordsRelationTable)
			.values({
				disasterRecordId: recA1.id,
				sectorId: sec1.id,
				withDamage: true,
			})
			.returning();
		const [secRelB] = await dr
			.insert(sectorDisasterRecordsRelationTable)
			.values({
				disasterRecordId: recB1.id,
				sectorId: sec1.id,
				withDamage: true,
			})
			.returning();

		const apiPost = (url: string, body: unknown) =>
			makeArgs(
				url,
				{},
				{ "X-Auth": secretA, "Content-Type": "application/json" },
				{ method: "POST", body: JSON.stringify(body) },
			);

		// 1. Non-economic losses API: add, update, upsert
		const badNonecoAdd = (await (
			await apiNonecoAddAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/add", [
					{
						disasterRecordId: recB1.id,
						categoryId: cat.id,
						description: "Foreign parent",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(badNonecoAdd.ok).toBe(false);

		const okNonecoAdd = (await (
			await apiNonecoAddAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/add", [
					{
						disasterRecordId: recA1.id,
						categoryId: cat2.id,
						description: "Own add",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(okNonecoAdd.ok).toBe(true);

		const badNonecoUpdateForeign = (await (
			await apiNonecoUpdateAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/update", [
					{
						id: nonecoB.id,
						disasterRecordId: recA1.id,
						description: "Moved",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(badNonecoUpdateForeign.ok).toBe(false);

		const badNonecoReparent = (await (
			await apiNonecoUpdateAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/update", [
					{
						id: nonecoA.id,
						disasterRecordId: recB1.id,
						description: "Foreign target",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(badNonecoReparent.ok).toBe(false);

		const okNonecoUpdate = (await (
			await apiNonecoUpdateAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/update", [
					{
						id: nonecoA.id,
						disasterRecordId: recA2.id,
						description: "Updated own",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(okNonecoUpdate.ok).toBe(true);

		const nonecoImpId = `nel-imp-${crypto.randomUUID()}`;
		const badNonecoUpsert = (await (
			await apiNonecoUpsertAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/upsert", [
					{
						apiImportId: nonecoImpId,
						disasterRecordId: recB1.id,
						categoryId: cat.id,
						description: "Foreign upsert",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(badNonecoUpsert.ok).toBe(false);

		const okNonecoUpsertCreate = (await (
			await apiNonecoUpsertAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/upsert", [
					{
						apiImportId: nonecoImpId,
						disasterRecordId: recA1.id,
						categoryId: cat3.id,
						description: "Upsert v1",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(okNonecoUpsertCreate.ok).toBe(true);

		const badNonecoUpsertReparent = (await (
			await apiNonecoUpsertAction(
				apiPost("http://localhost:3000/en/api/nonecolosses/upsert", [
					{
						apiImportId: nonecoImpId,
						disasterRecordId: recB1.id,
						categoryId: cat3.id,
						description: "Upsert foreign parent",
					},
				]),
			)
		).json()) as { ok: boolean };
		expect(badNonecoUpsertReparent.ok).toBe(false);

		// 2. Non-economic losses web action rejects foreign row ID and succeeds for own record
		const badWebForm = new FormData();
		badWebForm.append("id", nonecoB.id);
		badWebForm.append("categoryId", cat.id);
		badWebForm.append("description", "Web overwrite");
		let thrownWebNoneco: unknown;
		try {
			await nonEcoWebAction(
				makeArgs(
					`http://localhost:3000/en/disaster-record/non-economic-losses/${recA1.id}`,
					{ id: recA1.id },
					{ Cookie: cookieA },
					{ method: "POST", body: badWebForm },
				),
			);
		} catch (e) {
			thrownWebNoneco = e;
		}
		expect(thrownWebNoneco).toBeInstanceOf(Response);
		expect((thrownWebNoneco as Response).status).toBe(404);

		const [nonecoBAfter] = await dr
			.select()
			.from(nonecoLossesTable)
			.where(eq(nonecoLossesTable.id, nonecoB.id));
		expect(nonecoBAfter.disasterRecordId).toBe(recB1.id);
		expect(nonecoBAfter.description).toBe("Tenant B original");

		const okWebForm = new FormData();
		okWebForm.append("categoryId", cat4.id);
		okWebForm.append("description", "Web own create");
		const okWebRes = await nonEcoWebAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/non-economic-losses/${recA1.id}`,
				{ id: recA1.id },
				{ Cookie: cookieA },
				{ method: "POST", body: okWebForm },
			),
		);
		expect(okWebRes).toBeInstanceOf(Response);
		expect((okWebRes as Response).status).toBe(302);

		// 3. Sector relations API: add, update, upsert
		const badSecAdd = (await (
			await apiSectorRelAddAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/add",
					[
						{
							disasterRecordId: recB1.id,
							sectorId: sec2.id,
							withDamage: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(badSecAdd.ok).toBe(false);

		const okSecAdd = (await (
			await apiSectorRelAddAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/add",
					[
						{
							disasterRecordId: recA1.id,
							sectorId: sec2.id,
							withDamage: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(okSecAdd.ok).toBe(true);

		const badSecUpdateForeign = (await (
			await apiSectorRelUpdateAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/update",
					[
						{
							id: secRelB.id,
							disasterRecordId: recA1.id,
							withDamage: true,
							withLosses: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(badSecUpdateForeign.ok).toBe(false);

		const badSecReparent = (await (
			await apiSectorRelUpdateAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/update",
					[
						{
							id: secRelA.id,
							disasterRecordId: recB1.id,
							withDamage: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(badSecReparent.ok).toBe(false);

		const okSecUpdate = (await (
			await apiSectorRelUpdateAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/update",
					[
						{
							id: secRelA.id,
							withDamage: true,
							withDisruption: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(okSecUpdate.ok).toBe(true);

		const secImpId = `sec-imp-${crypto.randomUUID()}`;
		const badSecUpsert = (await (
			await apiSectorRelUpsertAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/upsert",
					[
						{
							apiImportId: secImpId,
							disasterRecordId: recB1.id,
							sectorId: sec2.id,
							withDamage: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(badSecUpsert.ok).toBe(false);

		const okSecUpsert = (await (
			await apiSectorRelUpsertAction(
				apiPost(
					"http://localhost:3000/en/api/sector-disaster-record-relation/upsert",
					[
						{
							apiImportId: secImpId,
							disasterRecordId: recA2.id,
							sectorId: sec2.id,
							withDamage: true,
						},
					],
				),
			)
		).json()) as { ok: boolean };
		expect(okSecUpsert.ok).toBe(true);

		const [secRelBAfter] = await dr
			.select()
			.from(sectorDisasterRecordsRelationTable)
			.where(eq(sectorDisasterRecordsRelationTable.id, secRelB.id));
		expect(secRelBAfter.disasterRecordId).toBe(recB1.id);
		expect(secRelBAfter.withLosses).toBeFalsy();
	});

	it("CSV import routes, API sub-record upserts, custom asset checks, and entity updates preserve tenant ownership", async () => {
		const tenantA = await insertTenant();
		const tenantB = await insertTenant();
		const adminA = await insertUser();
		const cookieA = await buildSessionCookie({
			userId: adminA,
			tenantId: tenantA,
			role: "admin",
		});
		const ctx = new BackendContext({ params: { lang: "en" } } as any);

		const secretA = `key-imp-a-${crypto.randomUUID()}`;
		await dr.insert(apiKeyTable).values({
			name: "Tenant A Import Key",
			secret: secretA,
			managedByUserId: adminA,
			countryAccountsId: tenantA,
		});

		const [sector] = await dr
			.insert(sectorTable)
			.values({ name: { en: "Telecom" }, level: 1 })
			.returning();
		const [builtInAsset] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: true,
				builtInName: { en: "Tower" },
			})
			.returning();
		const [customAssetA] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: false,
				customName: "Asset A",
				countryAccountsId: tenantA,
			})
			.returning();
		const [customAssetB] = await dr
			.insert(assetTable)
			.values({
				sectorIds: sector.id,
				isBuiltIn: false,
				customName: "Asset B",
				countryAccountsId: tenantB,
			})
			.returning();

		const [recA] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantA, approvalStatus: "draft" })
			.returning();
		const [recB] = await dr
			.insert(disasterRecordsTable)
			.values({ countryAccountsId: tenantB, approvalStatus: "draft" })
			.returning();

		const [dmgB] = await dr
			.insert(damagesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				assetId: builtInAsset.id,
				totalDamageAmount: 11,
			})
			.returning();
		const [lossB] = await dr
			.insert(lossesTable)
			.values({
				recordId: recB.id,
				sectorId: sector.id,
				sectorIsAgriculture: false,
			})
			.returning();
		const [disB] = await dr
			.insert(disruptionTable)
			.values({ recordId: recB.id, sectorId: sector.id })
			.returning();

		const makeCsvForm = (importType: string, csv: string) => {
			const fd = new FormData();
			fd.append("import_type", importType);
			fd.append("file", new File([csv], "import.csv", { type: "text/csv" }));
			return fd;
		};

		// 1. Route-level CSV import rejects cross-tenant update/create with a non-empty error message and succeeds for own record
		const dmgCsvForeign = await damagesCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/damages/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"update",
						`id,recordId,sectorId,assetId\n${dmgB.id},${recA.id},${sector.id},${builtInAsset.id}\n`,
					),
				},
			),
		);
		expect(dmgCsvForeign.res.ok).toBe(false);
		expect((dmgCsvForeign.res as any).rowError?.message).toBeTruthy();

		const dmgCsvOwn = await damagesCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/damages/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"create",
						`recordId,sectorId,assetId\n${recA.id},${sector.id},${builtInAsset.id}\n`,
					),
				},
			),
		);
		expect(dmgCsvOwn.res.ok).toBe(true);

		const lossCsvForeign = await lossesCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/losses/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"update",
						`id,recordId,sectorId,sectorIsAgriculture\n${lossB.id},${recA.id},${sector.id},false\n`,
					),
				},
			),
		);
		expect(lossCsvForeign.res.ok).toBe(false);
		expect((lossCsvForeign.res as any).rowError?.message).toBeTruthy();

		const lossCsvOwn = await lossesCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/losses/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"create",
						`recordId,sectorId,sectorIsAgriculture\n${recA.id},${sector.id},false\n`,
					),
				},
			),
		);
		expect(lossCsvOwn.res.ok).toBe(true);

		const disCsvForeign = await disruptionsCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/disruptions/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"update",
						`id,recordId,sectorId\n${disB.id},${recA.id},${sector.id}\n`,
					),
				},
			),
		);
		expect(disCsvForeign.res.ok).toBe(false);
		expect((disCsvForeign.res as any).rowError?.message).toBeTruthy();

		const disCsvOwn = await disruptionsCsvImportAction(
			makeArgs(
				`http://localhost:3000/en/disaster-record/edit-sub/${recA.id}/disruptions/csv-import`,
				{ disRecId: recA.id },
				{ Cookie: cookieA },
				{
					method: "POST",
					body: makeCsvForm(
						"create",
						`recordId,sectorId\n${recA.id},${sector.id}\n`,
					),
				},
			),
		);
		expect(disCsvOwn.res.ok).toBe(true);

		// 2. Damages create rejects another tenant's custom asset while allowing own custom asset
		const badCustomAsset = await damagesCreate(
			ctx,
			dr,
			{
				recordId: recA.id,
				sectorId: sector.id,
				assetId: customAssetB.id,
			} as any,
			tenantA,
		);
		expect(badCustomAsset.ok).toBe(false);

		const okCustomAsset = await damagesCreate(
			ctx,
			dr,
			{
				recordId: recA.id,
				sectorId: sector.id,
				assetId: customAssetA.id,
			} as any,
			tenantA,
		);
		expect(okCustomAsset.ok).toBe(true);

		// 3. Route-level API upsert for damage, losses, and disruption rejects foreign parent and succeeds for own record
		const apiPost = (url: string, body: unknown) =>
			makeArgs(
				url,
				{},
				{ "X-Auth": secretA, "Content-Type": "application/json" },
				{ method: "POST", body: JSON.stringify(body) },
			);

		const dmgImp = `api-dmg-${crypto.randomUUID()}`;
		expect(
			(
				(await (
					await apiDamageUpsertAction(
						apiPost("http://localhost:3000/en/api/damage/upsert", [
							{
								apiImportId: dmgImp,
								recordId: recB.id,
								sectorId: sector.id,
								assetId: builtInAsset.id,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(false);
		expect(
			(
				(await (
					await apiDamageUpsertAction(
						apiPost("http://localhost:3000/en/api/damage/upsert", [
							{
								apiImportId: dmgImp,
								recordId: recA.id,
								sectorId: sector.id,
								assetId: builtInAsset.id,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(true);

		const lossImp = `api-loss-${crypto.randomUUID()}`;
		expect(
			(
				(await (
					await apiLossesUpsertAction(
						apiPost("http://localhost:3000/en/api/losses/upsert", [
							{
								apiImportId: lossImp,
								recordId: recB.id,
								sectorId: sector.id,
								sectorIsAgriculture: false,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(false);
		expect(
			(
				(await (
					await apiLossesUpsertAction(
						apiPost("http://localhost:3000/en/api/losses/upsert", [
							{
								apiImportId: lossImp,
								recordId: recA.id,
								sectorId: sector.id,
								sectorIsAgriculture: false,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(true);

		const disImp = `api-dis-${crypto.randomUUID()}`;
		expect(
			(
				(await (
					await apiDisruptionUpsertAction(
						apiPost("http://localhost:3000/en/api/disruption/upsert", [
							{
								apiImportId: disImp,
								recordId: recB.id,
								sectorId: sector.id,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(false);
		expect(
			(
				(await (
					await apiDisruptionUpsertAction(
						apiPost("http://localhost:3000/en/api/disruption/upsert", [
							{
								apiImportId: disImp,
								recordId: recA.id,
								sectorId: sector.id,
							},
						]),
					)
				).json()) as { ok: boolean }
			).ok,
		).toBe(true);

		// 4. Tenant-scoped entity updates ignore supplied countryAccountsId so rows cannot be reassigned to another tenant
		const hipTypeId = `ht-up-${crypto.randomUUID().slice(0, 8)}`;
		await dr
			.insert(hipTypeTable)
			.values({ id: hipTypeId, name: { en: "Meteorological" } });
		const [heEv] = await dr.insert(eventTable).values({}).returning();
		await dr.insert(hazardousEventTable).values({
			id: heEv.id,
			countryAccountsId: tenantA,
			hipTypeId,
			approvalStatus: "draft",
		});
		const [deEv] = await dr.insert(eventTable).values({}).returning();
		await dr.insert(disasterEventTable).values({
			id: deEv.id,
			countryAccountsId: tenantA,
			nameNational: "Event A",
			approvalStatus: "draft",
		});

		expect(
			(
				await disasterRecordsUpdate(
					ctx,
					dr,
					recA.id,
					{ countryAccountsId: tenantB } as any,
					tenantA,
				)
			).ok,
		).toBe(true);
		const [recAAfter] = await dr
			.select()
			.from(disasterRecordsTable)
			.where(eq(disasterRecordsTable.id, recA.id));
		expect(recAAfter.countryAccountsId).toBe(tenantA);

		expect(
			(
				await disasterEventUpdateByIdAndCountryAccountsId(
					ctx,
					dr,
					deEv.id,
					tenantA,
					{ nameNational: "Event A Updated", countryAccountsId: tenantB } as any,
				)
			).ok,
		).toBe(true);
		const [deAfter] = await dr
			.select()
			.from(disasterEventTable)
			.where(eq(disasterEventTable.id, deEv.id));
		expect(deAfter.countryAccountsId).toBe(tenantA);

		expect(
			(
				await hazardousEventUpdateByIdAndCountryAccountsId(
					ctx,
					dr,
					heEv.id,
					tenantA,
					{ description: "Updated", countryAccountsId: tenantB } as any,
				)
			).ok,
		).toBe(true);
		const [heAfter] = await dr
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, heEv.id));
		expect(heAfter.countryAccountsId).toBe(tenantA);

		expect(
			(
				await assetUpdateByIdAndCountryAccountsId(
					ctx,
					dr,
					customAssetA.id,
					tenantA,
					{ name: "Asset A Updated", countryAccountsId: tenantB } as any,
				)
			).ok,
		).toBe(true);
		const [assetAAfter] = await dr
			.select()
			.from(assetTable)
			.where(eq(assetTable.id, customAssetA.id));
		expect(assetAAfter.countryAccountsId).toBe(tenantA);
	});
});
