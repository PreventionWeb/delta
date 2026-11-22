import "../../db/setup";
import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";

import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { dr } from "~/db.server";
import { apiKeyTable } from "~/drizzle/schema/apiKeyTable";
import { userCountryAccountsTable } from "~/drizzle/schema/userCountryAccountsTable";
import { eventTable } from "~/drizzle/schema/eventTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { CoreModule } from "~/infrastructure/CoreModule.server";
import { mountOpenApiDocs } from "~/init.server";
import { insertTenant, insertUser } from "../notices/testHelpers";
import { seedSpecificHazard } from "../../db/models/hazardousEventTestHelpers";

async function createApiKey(options: {
	userId: string;
	tenantId: string;
	role?: string;
}): Promise<string> {
	const secret = `delta_key_${crypto.randomUUID()}`;
	await dr.insert(apiKeyTable).values({
		secret,
		name: "Test API Key",
		managedByUserId: options.userId,
		countryAccountsId: options.tenantId,
	});

	if (options.role) {
		await dr.insert(userCountryAccountsTable).values({
			userId: options.userId,
			countryAccountsId: options.tenantId,
			role: options.role,
		});
	}

	return secret;
}

describe("HazardousEventsController", () => {
	let app: INestApplication;
	let moduleRef: TestingModule;
	let request: ReturnType<typeof supertest>;

	let tenantAId: string;
	let userAId: string;
	let apiKeyEditorA: string;
	let apiKeyViewerA: string;

	let tenantBId: string;
	let userBId: string;
	let apiKeyEditorB: string;

	let specificHazardId: string;

	beforeAll(async () => {
		moduleRef = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();

		app = moduleRef.createNestApplication();
		app.setGlobalPrefix("/api/v2");
		mountOpenApiDocs(app);
		await app.init();
		await app.listen(0);
		request = supertest(app.getHttpServer());

		tenantAId = await insertTenant();
		userAId = await insertUser();
		apiKeyEditorA = await createApiKey({
			userId: userAId,
			tenantId: tenantAId,
			role: "data-collector", // has EditData and ViewData
		});

		const viewerUserId = await insertUser();
		apiKeyViewerA = await createApiKey({
			userId: viewerUserId,
			tenantId: tenantAId,
			role: "data-viewer", // has ViewData only
		});

		tenantBId = await insertTenant();
		userBId = await insertUser();
		apiKeyEditorB = await createApiKey({
			userId: userBId,
			tenantId: tenantBId,
			role: "data-collector",
		});

		specificHazardId = await seedSpecificHazard();
	});

	afterAll(async () => {
		await app.close();
		await moduleRef.close();
	});

	describe("Authentication & Authorization Guards", () => {
		it("rejects unauthenticated requests with 401 Unauthorized", async () => {
			const resGet = await request.get("/api/v2/hazardous-events");
			expect(resGet.status).toBe(401);

			const resPost = await request.post("/api/v2/hazardous-events").send({});
			expect(resPost.status).toBe(401);

			const resInvalidKey = await request
				.get("/api/v2/hazardous-events")
				.set("X-Auth", "invalid-key");
			expect(resInvalidKey.status).toBe(401);
		});

		it("rejects mutating endpoints with 403 Forbidden when caller lacks EditData permission", async () => {
			const resPost = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyViewerA)
				.send({
					specificHazardId,
					startDate: "2026-01-01",
					endDate: "2026-01-02",
				});
			expect(resPost.status).toBe(403);

			const validUuid = crypto.randomUUID();
			const resPut = await request
				.put(`/api/v2/hazardous-events/${validUuid}`)
				.set("X-Auth", apiKeyViewerA)
				.send({ description: "Updated" });
			expect(resPut.status).toBe(403);

			const resDelete = await request
				.delete(`/api/v2/hazardous-events/${validUuid}`)
				.set("X-Auth", apiKeyViewerA);
			expect(resDelete.status).toBe(403);

			const resSpatial = await request
				.post(`/api/v2/hazardous-events/${validUuid}/spatial-observations`)
				.set("X-Auth", apiKeyViewerA)
				.send({ geometries: [], divisionIds: [] });
			expect(resSpatial.status).toBe(403);
		});

		it("rejects GET endpoints with 403 Forbidden when caller lacks ViewData permission", async () => {
			const noRoleUserId = await insertUser();
			const apiKeyNoRole = await createApiKey({
				userId: noRoleUserId,
				tenantId: tenantAId,
			});

			const resList = await request
				.get("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyNoRole);
			expect(resList.status).toBe(403);

			const resTaxonomy = await request
				.get("/api/v2/hazardous-events/taxonomy")
				.set("X-Auth", apiKeyNoRole);
			expect(resTaxonomy.status).toBe(403);

			const resDownload = await request
				.get(
					`/api/v2/hazardous-events/${crypto.randomUUID()}/attachments/${crypto.randomUUID()}/download`,
				)
				.set("X-Auth", apiKeyNoRole);
			expect(resDownload.status).toBe(403);
		});
	});

	describe("POST /api/v2/hazardous-events", () => {
		it("returns 422 Unprocessable Entity when request body fails zod validation", async () => {
			const res = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					// Missing required specificHazardId and startDate/endDate
					description: "Missing required fields",
				});

			expect(res.status).toBe(422);
			expect(res.body.error?.message).toBe("Validation failed");
			expect(res.body.error?.details).toBeDefined();
		});

		it("returns 422 Unprocessable Entity when dates fail flexible date format validation", async () => {
			const resInvalidMonth = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-100-44",
					endDate: "2026-01-44",
					description: "Invalid date format",
				});

			expect(resInvalidMonth.status).toBe(422);
			expect(resInvalidMonth.body.error?.message).toBe("Validation failed");

			const resReversedDates = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-01-20",
					endDate: "2026-01-10",
					description: "Start later than end",
				});

			expect(resReversedDates.status).toBe(422);
			expect(resReversedDates.body.error?.message).toBe("Validation failed");
		});

		it("creates a new event with 201 Created and ignores any payload tenantId", async () => {
			const res = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-01-10",
					endDate: "2026-01-15",
					description: "Flood in District A",
					nationalSpecification: "Flash Flood",
					// Attempt to spoof tenant ID to tenant B
					tenantId: tenantBId,
					countryAccountsId: tenantBId,
				});

			expect(res.status).toBe(201);
			expect(res.body.id).toBeDefined();
			// Multi-tenancy check: Must be assigned to tenant A, not spoofed tenant B
			expect(res.body.tenantId).toBe(tenantAId);
			expect(res.body.createdByUserId).toBe(userAId);
			expect(res.body.workflowStatus).toBe("DRAFT");
			expect(res.body.description).toBe("Flood in District A");
		});
	});

	describe("GET /api/v2/hazardous-events", () => {
		it("returns 200 OK with list result and ADR-007 plain format", async () => {
			const res = await request
				.get("/api/v2/hazardous-events?page=1&pageSize=10")
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.items)).toBe(true);
			expect(typeof res.body.totalCount).toBe("number");
			expect(typeof res.body.unfilteredTotalCount).toBe("number");
			// Ensure no legacy envelope
			expect(res.body.ok).toBeUndefined();
			expect(res.body.res).toBeUndefined();
		});

		it("data-viewer role queries only receive approved/published events", async () => {
			const res = await request
				.get("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyViewerA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.items)).toBe(true);
			for (const item of res.body.items) {
				expect(["APPROVED", "PUBLISHED"]).toContain(item.workflowStatus);
			}
		});
	});

	describe("GET /api/v2/hazardous-events/specific-hazards", () => {
		it("returns 200 OK with list of specific hazards", async () => {
			const res = await request
				.get("/api/v2/hazardous-events/specific-hazards")
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThan(0);
			const found = res.body.find(
				(item: { id: string }) => item.id === specificHazardId,
			);
			expect(found).toBeDefined();
			expect(found.id).toBe(specificHazardId);
			expect(found.code).toBeDefined();
			expect(found.name).toBeDefined();
			expect(found.clusterId).toBeDefined();
		});

		it("allows access with ViewData permission (data-viewer role)", async () => {
			const res = await request
				.get("/api/v2/hazardous-events/specific-hazards")
				.set("X-Auth", apiKeyViewerA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
		});

		it("rejects unauthenticated requests with 401 Unauthorized", async () => {
			const res = await request.get(
				"/api/v2/hazardous-events/specific-hazards",
			);
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/v2/hazardous-events/taxonomy", () => {
		it("returns 200 OK with full taxonomy options", async () => {
			const res = await request
				.get("/api/v2/hazardous-events/taxonomy")
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.types)).toBe(true);
			expect(Array.isArray(res.body.clusters)).toBe(true);
			expect(Array.isArray(res.body.specificHazards)).toBe(true);
			expect(res.body.types.length).toBeGreaterThan(0);
			expect(res.body.clusters.length).toBeGreaterThan(0);
			expect(res.body.specificHazards.length).toBeGreaterThan(0);
			const found = res.body.specificHazards.find(
				(item: { id: string }) => item.id === specificHazardId,
			);
			expect(found).toBeDefined();
		});

		it("allows access with ViewData permission (data-viewer role)", async () => {
			const res = await request
				.get("/api/v2/hazardous-events/taxonomy")
				.set("X-Auth", apiKeyViewerA);

			expect(res.status).toBe(200);
		});

		it("rejects unauthenticated requests with 401 Unauthorized", async () => {
			const res = await request.get("/api/v2/hazardous-events/taxonomy");
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/v2/hazardous-events/:id", () => {
		it("returns 400 Bad Request if :id is not a valid UUID", async () => {
			const res = await request
				.get("/api/v2/hazardous-events/not-a-valid-uuid")
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(400);
		});

		it("returns 404 Not Found if event does not exist", async () => {
			const nonExistentId = crypto.randomUUID();
			const res = await request
				.get(`/api/v2/hazardous-events/${nonExistentId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(404);
		});

		it("returns 404 Not Found if event belongs to another tenant", async () => {
			// Create event in Tenant B
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorB)
				.send({
					specificHazardId,
					startDate: "2026-02-01",
					endDate: "2026-02-05",
				});
			expect(createRes.status).toBe(201);
			const eventBId = createRes.body.id;

			// Tenant A tries to access event B
			const res = await request
				.get(`/api/v2/hazardous-events/${eventBId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(404);
		});

		it("returns 200 OK with event details for existing event in caller tenant", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-03-01",
					endDate: "2026-03-05",
					description: "Detailed Event",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			const res = await request
				.get(`/api/v2/hazardous-events/${eventId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(200);
			expect(res.body.id).toBe(eventId);
			expect(res.body.tenantId).toBe(tenantAId);
			expect(res.body.description).toBe("Detailed Event");
			expect(res.body.workflowStatus).toBe("DRAFT");
		});
	});

	describe("PUT /api/v2/hazardous-events/:id", () => {
		it("returns 400 Bad Request on invalid UUID", async () => {
			const res = await request
				.put("/api/v2/hazardous-events/invalid-uuid")
				.set("X-Auth", apiKeyEditorA)
				.send({ description: "Test" });

			expect(res.status).toBe(400);
		});

		it("returns 404 Not Found on nonexistent event", async () => {
			const nonExistentId = crypto.randomUUID();
			const res = await request
				.put(`/api/v2/hazardous-events/${nonExistentId}`)
				.set("X-Auth", apiKeyEditorA)
				.send({ description: "Test" });

			expect(res.status).toBe(404);
		});

		it("returns 422 Unprocessable Entity on invalid body payload", async () => {
			const res = await request
				.put(`/api/v2/hazardous-events/${crypto.randomUUID()}`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					startDate: "2026-04-20",
					endDate: "2026-04-10",
				});

			expect(res.status).toBe(422);
			expect(res.body.error?.message).toBe("Validation failed");
		});

		it("returns 200 OK on valid update", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-04-01",
					endDate: "2026-04-05",
					description: "Before Update",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			const updateRes = await request
				.put(`/api/v2/hazardous-events/${eventId}`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					description: "After Update",
					magnitude: "Category 3",
				});

			expect(updateRes.status).toBe(200);
			expect(updateRes.body.id).toBe(eventId);
			expect(updateRes.body.description).toBe("After Update");
			expect(updateRes.body.magnitude).toBe("Category 3");
		});
	});

	describe("DELETE /api/v2/hazardous-events/:id", () => {
		it("returns 400 Bad Request on invalid UUID", async () => {
			const res = await request
				.delete("/api/v2/hazardous-events/invalid-uuid")
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(400);
		});

		it("returns 404 Not Found on nonexistent event", async () => {
			const nonExistentId = crypto.randomUUID();
			const res = await request
				.delete(`/api/v2/hazardous-events/${nonExistentId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(404);
		});

		it("returns 409 Conflict if event has dependent records", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-05-01",
					endDate: "2026-05-05",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			// Insert dependent disaster event
			const [ev] = await dr
				.insert(eventTable)
				.values({})
				.returning({ id: eventTable.id });
			await dr.insert(disasterEventTable).values({
				id: ev.id,
				hazardousEventId: eventId,
				countryAccountsId: tenantAId,
			});

			const res = await request
				.delete(`/api/v2/hazardous-events/${eventId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(409);
			expect(res.body.error?.code).toBe("CONFLICT");
			expect(res.body.error?.details?.dependents).toBeDefined();
		});

		it("returns 204 No Content when deleting an event without dependents", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-06-01",
					endDate: "2026-06-05",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			const deleteRes = await request
				.delete(`/api/v2/hazardous-events/${eventId}`)
				.set("X-Auth", apiKeyEditorA);

			expect(deleteRes.status).toBe(204);
			expect(deleteRes.text).toBe("");

			// Verify event no longer exists
			const getRes = await request
				.get(`/api/v2/hazardous-events/${eventId}`)
				.set("X-Auth", apiKeyEditorA);
			expect(getRes.status).toBe(404);
		});
	});

	describe("POST /api/v2/hazardous-events/:id/spatial-observations", () => {
		it("returns 201 Created on valid spatial observation", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-07-01",
					endDate: "2026-07-05",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			const obsRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/spatial-observations`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					observationTime: "2026-07-02T10:00:00.000Z",
					geometries: [],
					divisionIds: [],
					note: "First observation",
				});

			expect(obsRes.status).toBe(201);
			expect(obsRes.body.id).toBeDefined();
			expect(obsRes.body.hazardousEventId).toBe(eventId);
			expect(obsRes.body.note).toBe("First observation");
		});

		it("returns 409 Conflict on duplicate observationTime without confirmReplace", async () => {
			const createRes = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-08-01",
					endDate: "2026-08-05",
				});
			expect(createRes.status).toBe(201);
			const eventId = createRes.body.id;

			const time = "2026-08-02T12:00:00.000Z";

			const obs1 = await request
				.post(`/api/v2/hazardous-events/${eventId}/spatial-observations`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					observationTime: time,
					geometries: [],
					divisionIds: [],
					note: "Initial",
				});
			expect(obs1.status).toBe(201);

			// Duplicate without confirmReplace -> 409
			const obs2 = await request
				.post(`/api/v2/hazardous-events/${eventId}/spatial-observations`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					observationTime: time,
					geometries: [],
					divisionIds: [],
					note: "Duplicate",
				});
			expect(obs2.status).toBe(409);

			// Duplicate with confirmReplace: true -> 201
			const obs3 = await request
				.post(`/api/v2/hazardous-events/${eventId}/spatial-observations`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					observationTime: time,
					geometries: [],
					divisionIds: [],
					note: "Replaced",
					confirmReplace: true,
				});
			expect(obs3.status).toBe(201);
			expect(obs3.body.note).toBe("Replaced");
		});
	});

	describe("Hazardous Event Attachments (/api/v2/hazardous-events/:id/attachments)", () => {
		let eventId: string;

		beforeAll(async () => {
			const res = await request
				.post("/api/v2/hazardous-events")
				.set("X-Auth", apiKeyEditorA)
				.send({
					specificHazardId,
					startDate: "2026-05-01",
					endDate: "2026-05-10",
					description: "Event with attachments",
				});
			expect(res.status).toBe(201);
			eventId = res.body.id;
		});

		it("POST saves an attachment into hazardous_event_attachment returning 201 Created", async () => {
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Situation Report #1",
					fileKey: "uploads/2026/sitrep1.pdf",
					fileName: "sitrep1.pdf",
					fileType: "application/pdf",
					fileSize: 1048576,
				});

			expect(res.status).toBe(201);
			expect(res.body.id).toBeDefined();
			expect(res.body.hazardousEventId).toBe(eventId);
			expect(res.body.title).toBe("Situation Report #1");
			expect(res.body.fileKey).toBe("uploads/2026/sitrep1.pdf");
			expect(res.body.fileName).toBe("sitrep1.pdf");
			expect(res.body.fileType).toBe("application/pdf");
			expect(res.body.fileSize).toBe(1048576);
			expect(res.body.createdAt).toBeDefined();
			expect(res.body.updatedAt).toBeDefined();
		});

		it("POST uploads a physical file via multipart/form-data returning 201 Created", async () => {
			const fileBuffer = Buffer.from(
				"%PDF-1.4 sample PDF content for hazardous event",
			);
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("title", "Physical Uploaded Report")
				.attach("file", fileBuffer, "sample_report.pdf");

			expect(res.status).toBe(201);
			expect(res.body.id).toBeDefined();
			expect(res.body.hazardousEventId).toBe(eventId);
			expect(res.body.title).toBe("Physical Uploaded Report");
			expect(res.body.fileName).toBe("sample_report.pdf");
			expect(res.body.fileType).toBe("application/pdf");
			expect(res.body.fileSize).toBe(fileBuffer.length);
			expect(res.body.fileKey).toContain(
				`/uploads/tenant-${tenantAId}/hazardous-event/${eventId}/`,
			);

			// Verify the physical file actually exists on disk
			const relativePath = res.body.fileKey.replace(/^\/+/, "");
			const absolutePath = path.resolve(process.cwd(), relativePath);
			expect(fs.existsSync(absolutePath)).toBe(true);

			// Delete it and verify physical file is cleaned up
			const deleteRes = await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${res.body.id}`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(deleteRes.status).toBe(204);
			expect(fs.existsSync(absolutePath)).toBe(false);
		});

		it("POST multipart upload defaults title to original filename when omitted", async () => {
			const fileBuffer = Buffer.from("sample doc content");
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.attach("file", fileBuffer, "notes.doc");

			expect(res.status).toBe(201);
			expect(res.body.title).toBe("notes.doc");
			expect(res.body.fileName).toBe("notes.doc");

			// Cleanup
			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${res.body.id}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});

		it("POST multipart upload rejects unsupported file extension with 422 Unprocessable Entity", async () => {
			const fileBuffer = Buffer.from("malicious binary content");
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("title", "Forbidden Executable")
				.attach("file", fileBuffer, "malware.exe");

			expect(res.status).toBe(422);
			expect(res.body.error?.message).toContain("Invalid file type");
		});

		it("POST multipart request missing file field rejects with 422 Unprocessable Entity", async () => {
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("title", "Only Title No File");

			expect(res.status).toBe(422);
			expect(res.body.error?.message).toContain("file is required");
		});

		it("GET lists all attachments for the event returning 200 OK", async () => {
			const res = await request
				.get(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThan(0);
			const attachment = res.body.find(
				(a: { title: string }) => a.title === "Situation Report #1",
			);
			expect(attachment).toBeDefined();
			expect(attachment.hazardousEventId).toBe(eventId);
		});

		it("GET allows data-viewer role with ViewData permission", async () => {
			const res = await request
				.get(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyViewerA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
		});

		it("POST rejects with 422 when required fields are missing", async () => {
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Missing fields",
				});

			expect(res.status).toBe(422);
			expect(res.body.error?.message).toBe("Validation failed");
		});

		it("POST rejects with 403 when caller lacks EditData permission", async () => {
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyViewerA)
				.send({
					title: "Attempted by viewer",
					fileKey: "uploads/2026/test.pdf",
					fileName: "test.pdf",
					fileType: "application/pdf",
					fileSize: 1024,
				});

			expect(res.status).toBe(403);
		});

		it("rejects operations on nonexistent or cross-tenant event with 404 Not Found", async () => {
			const nonExistentId = crypto.randomUUID();
			const resGet = await request
				.get(`/api/v2/hazardous-events/${nonExistentId}/attachments`)
				.set("X-Auth", apiKeyEditorA);
			expect(resGet.status).toBe(404);

			// Cross-tenant access attempt by tenant B
			const resCrossTenant = await request
				.get(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorB);
			expect(resCrossTenant.status).toBe(404);

			const resPostCrossTenant = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorB)
				.send({
					title: "Cross tenant attempt",
					fileKey: "uploads/test.pdf",
					fileName: "test.pdf",
					fileType: "application/pdf",
					fileSize: 1024,
				});
			expect(resPostCrossTenant.status).toBe(404);
		});

		it("rejects unauthenticated requests with 401 Unauthorized", async () => {
			const resGet = await request.get(
				`/api/v2/hazardous-events/${eventId}/attachments`,
			);
			expect(resGet.status).toBe(401);

			const resPost = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.send({});
			expect(resPost.status).toBe(401);
		});

		it("DELETE removes an attachment returning 204 No Content", async () => {
			// First, create an attachment to delete
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Attachment To Delete",
					fileKey: "uploads/temp.pdf",
					fileName: "temp.pdf",
					fileType: "application/pdf",
					fileSize: 512,
				});
			expect(createRes.status).toBe(201);
			const attachmentId = createRes.body.id;

			// Delete it
			const deleteRes = await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(deleteRes.status).toBe(204);

			// Verify it's no longer listed
			const listRes = await request
				.get(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA);
			expect(listRes.status).toBe(200);
			const found = listRes.body.find(
				(a: { id: string }) => a.id === attachmentId,
			);
			expect(found).toBeUndefined();
		});

		it("DELETE returns 404 when attachment does not exist", async () => {
			const nonExistentAttachmentId = crypto.randomUUID();
			const res = await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${nonExistentAttachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(res.status).toBe(404);
		});

		it("DELETE returns 404 on cross-tenant event or attachment", async () => {
			// Create attachment under tenant A
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Tenant A Attachment",
					fileKey: "uploads/a.pdf",
					fileName: "a.pdf",
					fileType: "application/pdf",
					fileSize: 100,
				});
			const attachmentId = createRes.body.id;

			// Tenant B attempts to delete Tenant A's attachment
			const res = await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorB);
			expect(res.status).toBe(404);
		});

		it("DELETE returns 400 when :id or :attachmentId is not a UUID", async () => {
			const resBadEventId = await request
				.delete(
					`/api/v2/hazardous-events/not-a-uuid/attachments/${crypto.randomUUID()}`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(resBadEventId.status).toBe(400);

			const resBadAttachmentId = await request
				.delete(`/api/v2/hazardous-events/${eventId}/attachments/not-a-uuid`)
				.set("X-Auth", apiKeyEditorA);
			expect(resBadAttachmentId.status).toBe(400);
		});

		it("DELETE returns 403 when caller lacks EditData permission", async () => {
			const res = await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${crypto.randomUUID()}`,
				)
				.set("X-Auth", apiKeyViewerA);
			expect(res.status).toBe(403);
		});

		it("DELETE returns 401 when unauthenticated", async () => {
			const res = await request.delete(
				`/api/v2/hazardous-events/${eventId}/attachments/${crypto.randomUUID()}`,
			);
			expect(res.status).toBe(401);
		});

		it("GET :id/attachments/:attachmentId/download streams the attachment binary file returning 200 OK", async () => {
			const fileBuffer = Buffer.from(
				"%PDF-1.4 sample PDF for download verification",
			);
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("title", "Downloadable Report")
				.attach("file", fileBuffer, "download_test.pdf");

			expect(createRes.status).toBe(201);
			const attachmentId = createRes.body.id;

			const downloadRes = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}/download`,
				)
				.set("X-Auth", apiKeyEditorA);

			expect(downloadRes.status).toBe(200);
			expect(downloadRes.headers["content-type"]).toBe("application/pdf");
			expect(downloadRes.headers["content-disposition"]).toContain(
				'attachment; filename="download_test.pdf"',
			);
			expect(downloadRes.body).toEqual(fileBuffer);

			// Clean up
			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});

		it("GET :id/attachments/:attachmentId/download allows data-viewer role with ViewData permission", async () => {
			const fileBuffer = Buffer.from("sample content for viewer");
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.attach("file", fileBuffer, "viewer_test.pdf");

			expect(createRes.status).toBe(201);
			const attachmentId = createRes.body.id;

			const downloadRes = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}/download`,
				)
				.set("X-Auth", apiKeyViewerA);

			expect(downloadRes.status).toBe(200);
			expect(downloadRes.body).toEqual(fileBuffer);

			// Clean up
			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});

		it("GET :id/attachments/:attachmentId/download returns 404 for nonexistent or cross-tenant attachment", async () => {
			const nonExistentAttachmentId = crypto.randomUUID();
			const res = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/${nonExistentAttachmentId}/download`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(res.status).toBe(404);

			// Cross-tenant access attempt by tenant B
			const fileBuffer = Buffer.from("tenant a private file");
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.attach("file", fileBuffer, "private.pdf");
			const attachmentId = createRes.body.id;

			const resCrossTenant = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}/download`,
				)
				.set("X-Auth", apiKeyEditorB);
			expect(resCrossTenant.status).toBe(404);

			// Clean up
			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});

		it("GET :id/attachments/:attachmentId/download returns 404 when physical file is missing from storage", async () => {
			const createRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Missing File Metadata",
					fileKey: `/uploads/tenant-${tenantAId}/hazardous-event/${eventId}/does-not-exist.pdf`,
					fileName: "does-not-exist.pdf",
					fileType: "application/pdf",
					fileSize: 256,
				});
			expect(createRes.status).toBe(201);
			const attachmentId = createRes.body.id;

			const downloadRes = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}/download`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(downloadRes.status).toBe(404);

			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${attachmentId}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});

		it("GET :id/attachments/:attachmentId/download returns 400 when :id or :attachmentId is not a UUID", async () => {
			const resBadEventId = await request
				.get(
					`/api/v2/hazardous-events/not-a-uuid/attachments/${crypto.randomUUID()}/download`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(resBadEventId.status).toBe(400);

			const resBadAttachmentId = await request
				.get(
					`/api/v2/hazardous-events/${eventId}/attachments/not-a-uuid/download`,
				)
				.set("X-Auth", apiKeyEditorA);
			expect(resBadAttachmentId.status).toBe(400);
		});

		it("GET :id/attachments/:attachmentId/download rejects unauthenticated requests with 401 Unauthorized", async () => {
			const res = await request.get(
				`/api/v2/hazardous-events/${eventId}/attachments/${crypto.randomUUID()}/download`,
			);
			expect(res.status).toBe(401);
		});

		it("POST rejects JSON attachment with path traversal or cross-tenant fileKey", async () => {
			const resTraversal = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Traversal Attempt",
					fileKey: `/uploads/tenant-${tenantAId}/../../etc/passwd`,
					fileName: "passwd",
					fileType: "text/plain",
					fileSize: 100,
				});
			expect(resTraversal.status).toBe(422);

			const resCrossTenantKey = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.send({
					title: "Cross-Tenant FileKey Attempt",
					fileKey: `/uploads/tenant-${tenantBId}/hazardous-event/${crypto.randomUUID()}/secret.pdf`,
					fileName: "secret.pdf",
					fileType: "application/pdf",
					fileSize: 100,
				});
			expect(resCrossTenantKey.status).toBe(422);
		});

		it("POST multipart upload rejects files exceeding 10MB with 413 Payload Too Large", async () => {
			const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
			const res = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.attach("file", oversizedBuffer, "too_large.pdf");
			expect(res.status).toBe(413);
		});

		it("POST multipart upload with duplicate id returns 409 Conflict and cleans up physical file", async () => {
			const duplicateId = crypto.randomUUID();
			const eventUploadDir = path.resolve(
				process.cwd(),
				"uploads",
				`tenant-${tenantAId}`,
				"hazardous-event",
				eventId,
			);

			const firstRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("id", duplicateId)
				.field("title", "Original")
				.attach("file", Buffer.from("%PDF-1.4 original"), "original.pdf");
			expect(firstRes.status).toBe(201);

			const filesBefore = fs.existsSync(eventUploadDir)
				? fs.readdirSync(eventUploadDir)
				: [];

			const dupRes = await request
				.post(`/api/v2/hazardous-events/${eventId}/attachments`)
				.set("X-Auth", apiKeyEditorA)
				.field("id", duplicateId)
				.field("title", "Duplicate")
				.attach("file", Buffer.from("%PDF-1.4 duplicate"), "duplicate.pdf");
			expect(dupRes.status).toBe(409);

			const filesAfter = fs.existsSync(eventUploadDir)
				? fs.readdirSync(eventUploadDir)
				: [];
			expect(filesAfter).toEqual(filesBefore);

			// Clean up
			await request
				.delete(
					`/api/v2/hazardous-events/${eventId}/attachments/${duplicateId}`,
				)
				.set("X-Auth", apiKeyEditorA);
		});
	});

	describe("OpenAPI Documentation", () => {
		it("GET /api/v2/docs-json covers all Hazardous Events routes", async () => {
			const res = await request.get("/api/v2/docs-json");

			expect(res.status).toBe(200);
			const paths = Object.keys(res.body.paths);

			expect(paths).toContain("/api/v2/hazardous-events");
			expect(paths).toContain("/api/v2/hazardous-events/specific-hazards");
			expect(paths).toContain("/api/v2/hazardous-events/taxonomy");
			expect(paths).toContain("/api/v2/hazardous-events/{id}");
			expect(paths).toContain(
				"/api/v2/hazardous-events/{id}/spatial-observations",
			);
			expect(paths).toContain("/api/v2/hazardous-events/{id}/attachments");
			expect(paths).toContain(
				"/api/v2/hazardous-events/{id}/attachments/{attachmentId}",
			);
			expect(paths).toContain(
				"/api/v2/hazardous-events/{id}/attachments/{attachmentId}/download",
			);

			const listOps = Object.keys(res.body.paths["/api/v2/hazardous-events"]);
			expect(listOps).toEqual(expect.arrayContaining(["get", "post"]));

			const specificHazardOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/specific-hazards"],
			);
			expect(specificHazardOps).toContain("get");

			const taxonomyOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/taxonomy"],
			);
			expect(taxonomyOps).toContain("get");

			const byIdOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/{id}"],
			);
			expect(byIdOps).toEqual(expect.arrayContaining(["get", "put", "delete"]));

			const spatialOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/{id}/spatial-observations"],
			);
			expect(spatialOps).toContain("post");

			const attachmentOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/{id}/attachments"],
			);
			expect(attachmentOps).toEqual(expect.arrayContaining(["get", "post"]));

			const attachmentMemberOps = Object.keys(
				res.body.paths[
					"/api/v2/hazardous-events/{id}/attachments/{attachmentId}"
				],
			);
			expect(attachmentMemberOps).toContain("delete");

			const attachmentDownloadOps = Object.keys(
				res.body.paths[
					"/api/v2/hazardous-events/{id}/attachments/{attachmentId}/download"
				],
			);
			expect(attachmentDownloadOps).toContain("get");
		});
	});
});
