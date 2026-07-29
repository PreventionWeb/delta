import "../../db/setup";
import "reflect-metadata";

import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	afterAll,
	beforeEach,
} from "vitest";

import { dr } from "~/db.server";
import { noticesTable } from "~/drizzle/schema/noticesTable";
import { CoreModule } from "~/infrastructure/CoreModule.server";
import { initCookieStorage } from "~/utils/session";
import {
	__getBasePinoInstanceForTest,
	contextMixin,
} from "~/infrastructure/logging/PinoLogger.server";
import { ListNoticesUseCase } from "~/domains/notices/application/use-cases/ListNotices";
import { insertTenant, insertUser, buildSessionCookie } from "./testHelpers";

// This test compiles CoreModule directly without calling app.setGlobalPrefix("/api/v2")
// (that's applied only in init.server.tsx's real bootstrap — see Section 10's
// OpenApiDocs.test.ts), so routes are exercised at their bare "/notices" path here,
// matching how specs/notices-controller/spec.md itself describes the endpoints.

async function insertNotice(overrides: {
	tenantId: string;
	title?: string;
	body?: string | null;
	locale?: string;
	isPublished?: boolean;
}): Promise<string> {
	const [row] = await dr
		.insert(noticesTable)
		.values({
			countryAccountsId: overrides.tenantId,
			title: overrides.title ?? "English title",
			body: overrides.body ?? null,
			locale: overrides.locale ?? "en",
			isPublished: overrides.isPublished ?? false,
			audience: "all",
		})
		.returning({ id: noticesTable.id });
	return row.id;
}

describe("NoticesController", () => {
	let app: INestApplication;
	let request: ReturnType<typeof supertest>;
	let modulesToClose: TestingModule[];
	let moduleRef: TestingModule;
	let tenantId: string;
	let userId: string;
	let cookie: string;

	beforeAll(async () => {
		initCookieStorage();
	});

	beforeEach(async () => {
		modulesToClose = [];
		moduleRef = await Test.createTestingModule({
			imports: [CoreModule],
		}).compile();
		modulesToClose.push(moduleRef);
		app = moduleRef.createNestApplication();
		await app.init();
		await app.listen(0);
		request = supertest(app.getHttpServer());

		tenantId = await insertTenant();
		userId = await insertUser();
		cookie = await buildSessionCookie({ userId, tenantId });
	});

	afterAll(async () => {
		await app?.close();
		await Promise.all(modulesToClose.map((m) => m.close()));
	});

	// -------------------------------------------------------------------------
	// GET /notices
	// -------------------------------------------------------------------------

	it("GET /notices returns 200 with each notice's title/body/locale exactly as stored", async () => {
		await insertNotice({
			tenantId,
			title: "Titre français",
			body: "Corps français",
			locale: "fr",
		});

		const res = await request.get("/notices").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0].title).toBe("Titre français");
		expect(res.body[0].body).toBe("Corps français");
		expect(res.body[0].locale).toBe("fr");
	});

	it("GET /notices with no query params uses parsePagination's defaults", async () => {
		const executeSpy = vi.spyOn(moduleRef.get(ListNoticesUseCase), "execute");

		const res = await request.get("/notices").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId, page: 1, pageSize: 20 }),
		);
	});

	it("GET /notices?page=2&pageSize=5 is honored", async () => {
		const executeSpy = vi.spyOn(moduleRef.get(ListNoticesUseCase), "execute");

		const res = await request
			.get("/notices?page=2&pageSize=5")
			.set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId, page: 2, pageSize: 5 }),
		);
	});

	it("GET /notices?pageSize=500 is clamped to parsePagination's cap (100)", async () => {
		const executeSpy = vi.spyOn(moduleRef.get(ListNoticesUseCase), "execute");

		const res = await request
			.get("/notices?pageSize=500")
			.set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId, pageSize: 100 }),
		);
	});

	// pageSize=0 is falsy, so parsePagination's `|| 20` fallback applies — documenting
	// this existing clamping behavior, not introducing new logic (design.md Decision 12).
	it("GET /notices?pageSize=0 falls back to parsePagination's default of 20", async () => {
		const executeSpy = vi.spyOn(moduleRef.get(ListNoticesUseCase), "execute");

		const res = await request.get("/notices?pageSize=0").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId, pageSize: 20 }),
		);
	});

	it("GET /notices?page=-1 clamps to parsePagination's minimum of 1", async () => {
		const executeSpy = vi.spyOn(moduleRef.get(ListNoticesUseCase), "execute");

		const res = await request.get("/notices?page=-1").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(executeSpy).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId, page: 1 }),
		);
	});

	it("GET /notices returns an empty array for a tenant with no notices", async () => {
		const res = await request.get("/notices").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body).toEqual([]);
	});

	// -------------------------------------------------------------------------
	// GET /notices/:id
	// -------------------------------------------------------------------------

	it("GET /notices/:id returns 200 with the notice's title/body/locale as stored", async () => {
		const id = await insertNotice({ tenantId, title: "English title" });

		const res = await request.get(`/notices/${id}`).set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.id).toBe(id);
		expect(res.body.title).toBe("English title");
	});

	it("GET /notices/:id with an uppercase-cased UUID still validates and resolves", async () => {
		const id = await insertNotice({ tenantId });

		const res = await request
			.get(`/notices/${id.toUpperCase()}`)
			.set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.id).toBe(id);
	});

	it("GET /notices/not-a-uuid returns 400", async () => {
		const res = await request.get("/notices/not-a-uuid").set("Cookie", cookie);
		expect(res.status).toBe(400);
	});

	it("GET /notices/:id for a notice in another tenant returns 404", async () => {
		const otherTenantId = await insertTenant();
		const id = await insertNotice({ tenantId: otherTenantId });

		const res = await request.get(`/notices/${id}`).set("Cookie", cookie);

		expect(res.status).toBe(404);
	});

	it("a NotFoundError reaches the client via the ADR-003 envelope with a traceId", async () => {
		const otherTenantId = await insertTenant();
		const id = await insertNotice({ tenantId: otherTenantId });

		const res = await request.get(`/notices/${id}`).set("Cookie", cookie);

		expect(res.body).toMatchObject({
			success: false,
			error: { code: "NOT_FOUND" },
		});
		expect(res.body.error.traceId).toMatch(/^[0-9a-f-]{36}$/i);
	});

	// -------------------------------------------------------------------------
	// POST /notices
	// -------------------------------------------------------------------------

	it("POST /notices with a valid body creates a notice and returns 201", async () => {
		const res = await request.post("/notices").set("Cookie", cookie).send({
			title: "New notice",
			body: null,
			locale: "en",
			isPublished: false,
		});

		expect(res.status).toBe(201);
		expect(res.body.title).toBe("New notice");
		expect(res.body.locale).toBe("en");

		const rows = await dr
			.select()
			.from(noticesTable)
			.where(eq(noticesTable.countryAccountsId, tenantId));
		expect(rows).toHaveLength(1);
	});

	it("POST /notices with a body missing title returns 422", async () => {
		const res = await request
			.post("/notices")
			.set("Cookie", cookie)
			.send({ body: null, locale: "en", isPublished: false });

		expect(res.status).toBe(422);
	});

	// Gap found in the test-completeness pass: locale is required on create (ADR-008) but had
	// no coverage for the missing-field case, only the unsupported-value case further down.
	it("POST /notices with a body missing locale returns 422", async () => {
		const res = await request
			.post("/notices")
			.set("Cookie", cookie)
			.send({ title: "New notice", body: null, isPublished: false });

		expect(res.status).toBe(422);
	});

	it("POST /notices ignores a tenantId field in the body", async () => {
		const otherTenantId = await insertTenant();

		const res = await request.post("/notices").set("Cookie", cookie).send({
			title: "New notice",
			body: null,
			locale: "en",
			isPublished: false,
			tenantId: otherTenantId,
		});

		expect(res.status).toBe(201);
		expect(res.body.tenantId).toBe(tenantId);
	});

	it("POST /notices with an unsupported locale returns 422, not 201", async () => {
		const res = await request.post("/notices").set("Cookie", cookie).send({
			title: "New notice",
			body: null,
			locale: "xx",
			isPublished: false,
		});

		expect(res.status).toBe(422);
	});

	// -------------------------------------------------------------------------
	// PUT /notices/:id
	// -------------------------------------------------------------------------

	// Found in SOLID review: POST already had this coverage, PUT didn't.
	it("PUT /notices/:id ignores a tenantId field in the body, using the caller's own tenant", async () => {
		const id = await insertNotice({ tenantId, title: "Old title" });
		const otherTenantId = await insertTenant();

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ title: "Updated title", tenantId: otherTenantId });

		expect(res.status).toBe(200);
		expect(res.body.tenantId).toBe(tenantId);
	});

	it("PUT /notices/:id with a valid partial body returns 200 with the updated notice", async () => {
		const id = await insertNotice({ tenantId, title: "Old title" });

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ title: "Updated title" });

		expect(res.status).toBe(200);
		expect(res.body.title).toBe("Updated title");
	});

	// Gap found in the test-completeness pass: locale was only exercised via the 422 case below
	// (unsupported value); the actual successful-update path through the REST layer (not just
	// UpdateNoticeUseCase directly) had no coverage.
	it("PUT /notices/:id updates locale alone through the REST layer", async () => {
		const id = await insertNotice({ tenantId, locale: "en" });

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ locale: "fr" });

		expect(res.status).toBe(200);
		expect(res.body.locale).toBe("fr");
	});

	it("PUT /notices/:id with an invalid body returns 422", async () => {
		const id = await insertNotice({ tenantId });

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ isPublished: "not-a-boolean" });

		expect(res.status).toBe(422);
	});

	it("PUT /notices/:id with an unsupported locale returns 422", async () => {
		const id = await insertNotice({ tenantId });

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ locale: "xx" });

		expect(res.status).toBe(422);
	});

	it("PUT /notices/not-a-uuid returns 400", async () => {
		const res = await request
			.put("/notices/not-a-uuid")
			.set("Cookie", cookie)
			.send({ title: "x" });

		expect(res.status).toBe(400);
	});

	it("PUT /notices/:id for a notice in another tenant returns 404", async () => {
		const otherTenantId = await insertTenant();
		const id = await insertNotice({ tenantId: otherTenantId });

		const res = await request
			.put(`/notices/${id}`)
			.set("Cookie", cookie)
			.send({ title: "x" });

		expect(res.status).toBe(404);
	});

	// -------------------------------------------------------------------------
	// DELETE /notices/:id
	// -------------------------------------------------------------------------

	it("DELETE /notices/:id returns 204 and the notice is subsequently 404", async () => {
		const id = await insertNotice({ tenantId });

		const deleteRes = await request
			.delete(`/notices/${id}`)
			.set("Cookie", cookie);
		expect(deleteRes.status).toBe(204);
		expect(deleteRes.body).toEqual({});

		const getRes = await request.get(`/notices/${id}`).set("Cookie", cookie);
		expect(getRes.status).toBe(404);
	});

	it("DELETE /notices/not-a-uuid returns 400", async () => {
		const res = await request
			.delete("/notices/not-a-uuid")
			.set("Cookie", cookie);
		expect(res.status).toBe(400);
	});

	it("DELETE /notices/:id for a notice in another tenant returns 404", async () => {
		const otherTenantId = await insertTenant();
		const id = await insertNotice({ tenantId: otherTenantId });

		const res = await request.delete(`/notices/${id}`).set("Cookie", cookie);

		expect(res.status).toBe(404);
	});

	// -------------------------------------------------------------------------
	// ADR-004 structured logging — SessionAuthGuard populates the ALS store
	// (design.md Decision 11), not just request.tenantId/userId
	// -------------------------------------------------------------------------

	it("a log line emitted during an authenticated request carries tenantId/userId, not null", async () => {
		const basePino = __getBasePinoInstanceForTest();
		const capturedContexts: Array<Record<string, unknown>> = [];
		// contextMixin() is called here, synchronously, within the same ALS scope the real
		// mixin runs in — this is what the log line's own tenantId/userId would resolve to.
		const infoSpy = vi.spyOn(basePino, "info").mockImplementation(() => {
			capturedContexts.push(contextMixin());
			return basePino;
		});

		try {
			const res = await request.post("/notices").set("Cookie", cookie).send({
				title: "Logged notice",
				body: null,
				locale: "en",
				isPublished: false,
			});

			expect(res.status).toBe(201);
		} finally {
			infoSpy.mockRestore();
		}

		expect(capturedContexts.length).toBeGreaterThan(0);
		expect(capturedContexts[0].tenantId).toBe(tenantId);
		expect(capturedContexts[0].userId).toBe(userId);
	});

	// -------------------------------------------------------------------------
	// Authentication — no session cookie on any of the five routes
	// -------------------------------------------------------------------------

	it("GET /notices without a session returns 401", async () => {
		const res = await request.get("/notices");
		expect(res.status).toBe(401);
	});

	it("POST /notices without a session returns 401", async () => {
		const res = await request.post("/notices").send({});
		expect(res.status).toBe(401);
	});

	it("GET /notices/:id without a session returns 401", async () => {
		const id = await insertNotice({ tenantId });
		const res = await request.get(`/notices/${id}`);
		expect(res.status).toBe(401);
	});

	it("PUT /notices/:id without a session returns 401", async () => {
		const id = await insertNotice({ tenantId });
		const res = await request.put(`/notices/${id}`).send({ title: "x" });
		expect(res.status).toBe(401);
	});

	it("DELETE /notices/:id without a session returns 401", async () => {
		const id = await insertNotice({ tenantId });
		const res = await request.delete(`/notices/${id}`);
		expect(res.status).toBe(401);
	});
});
