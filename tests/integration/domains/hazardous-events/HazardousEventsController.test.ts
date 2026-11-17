import "../../db/setup";
import "reflect-metadata";

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
	let api眼erViewerA: string;

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
		api眼erViewerA = await createApiKey({
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
				.set("X-Auth", api眼erViewerA)
				.send({
					specificHazardId,
					startDate: "2026-01-01",
					endDate: "2026-01-02",
				});
			expect(resPost.status).toBe(403);

			const validUuid = crypto.randomUUID();
			const resPut = await request
				.put(`/api/v2/hazardous-events/${validUuid}`)
				.set("X-Auth", api眼erViewerA)
				.send({ description: "Updated" });
			expect(resPut.status).toBe(403);

			const resDelete = await request
				.delete(`/api/v2/hazardous-events/${validUuid}`)
				.set("X-Auth", api眼erViewerA);
			expect(resDelete.status).toBe(403);

			const resSpatial = await request
				.post(`/api/v2/hazardous-events/${validUuid}/spatial-observations`)
				.set("X-Auth", api眼erViewerA)
				.send({ geometries: [], divisionIds: [] });
			expect(resSpatial.status).toBe(403);
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
				.set("X-Auth", api眼erViewerA);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body.items)).toBe(true);
			for (const item of res.body.items) {
				expect(["APPROVED", "PUBLISHED"]).toContain(item.workflowStatus);
			}
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

	describe("OpenAPI Documentation", () => {
		it("GET /api/v2/docs-json covers all six Hazardous Events routes", async () => {
			const res = await request.get("/api/v2/docs-json");

			expect(res.status).toBe(200);
			const paths = Object.keys(res.body.paths);

			expect(paths).toContain("/api/v2/hazardous-events");
			expect(paths).toContain("/api/v2/hazardous-events/{id}");
			expect(paths).toContain(
				"/api/v2/hazardous-events/{id}/spatial-observations",
			);

			const listOps = Object.keys(res.body.paths["/api/v2/hazardous-events"]);
			expect(listOps).toEqual(expect.arrayContaining(["get", "post"]));

			const byIdOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/{id}"],
			);
			expect(byIdOps).toEqual(expect.arrayContaining(["get", "put", "delete"]));

			const spatialOps = Object.keys(
				res.body.paths["/api/v2/hazardous-events/{id}/spatial-observations"],
			);
			expect(spatialOps).toContain("post");
		});
	});
});
