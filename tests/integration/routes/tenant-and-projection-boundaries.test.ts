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
} from "~/backend.server/models/event";
import { hazardousEventBasicInfoById as hazardousEventBasicInfoByIdAlt } from "~/backend.server/models/event/hazardous_event_get";
import { loader as hazardousEventViewLoader } from "~/routes/$lang+/hazardous-event+/$id";
import { loader as damagesCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/csv-export";
import { loader as lossesCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/losses+/csv-export";
import { loader as disruptionsCsvLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/disruptions+/csv-export";
import { loader as damagesListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/_index";
import { loader as lossesListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/losses+/_index";
import { loader as disruptionsListLoader } from "~/routes/$lang+/disaster-record+/edit-sub.$disRecId+/disruptions+/_index";
import { loader as spatialFootprintLoader } from "~/routes/$lang+/api+/spatial-footprint-geojson";
import { action as categoryPresenceSaveAction } from "~/routes/$lang+/api+/human-effects+/category-presence-save";
import { loader as getAssetsLoader } from "~/routes/$lang+/api+/asset+/getassets";
import { loader as contentPickerLoader } from "~/routes/$lang+/disaster-record+/content-picker-datasource";
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
	});
});
