import "../../db/setup";
import "reflect-metadata";

import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { CoreModule } from "~/infrastructure/CoreModule.server";
import { mountOpenApiDocs } from "~/init.server";

describe("OpenAPI docs bootstrap", () => {
	let app: INestApplication;
	let moduleRef: TestingModule;
	let request: ReturnType<typeof supertest>;

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
	});

	afterAll(async () => {
		await app.close();
		await moduleRef.close();
	});

	it("GET /api/v2/docs returns the interactive Swagger UI", async () => {
		const res = await request.get("/api/v2/docs");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toMatch(/text\/html/);
	});

	it("GET /api/v2/docs injects security script and styles to mask X-Auth credentials", async () => {
		const res = await request.get("/api/v2/docs");

		expect(res.status).toBe(200);
		expect(res.text).toContain("[DELTA API KEY]");
		expect(res.text).toContain("-webkit-text-security: disc");
	});

	it("GET /api/v2/docs-json returns a well-formed OpenAPI document", async () => {
		const res = await request.get("/api/v2/docs-json");

		expect(res.status).toBe(200);
		expect(res.body.openapi).toMatch(/^3\./);
		expect(res.body.paths).toBeTypeOf("object");
	});

	it("the document at /api/v2/docs-json covers all five Notices endpoints", async () => {
		const res = await request.get("/api/v2/docs-json");

		// Paths reflect the real routable URL (global prefix included) — the document is
		// generated after app.setGlobalPrefix(), which is the more useful shape for API consumers.
		const paths = Object.keys(res.body.paths);
		expect(paths).toContain("/api/v2/notices");
		expect(paths).toContain("/api/v2/notices/{id}");

		const noticesOps = Object.keys(res.body.paths["/api/v2/notices"]);
		expect(noticesOps).toEqual(expect.arrayContaining(["get", "post"]));

		const noticeByIdOps = Object.keys(res.body.paths["/api/v2/notices/{id}"]);
		expect(noticeByIdOps).toEqual(
			expect.arrayContaining(["get", "put", "delete"]),
		);
	});

	it("a required field in CreateNoticeRequest appears as required in the POST requestBody schema", async () => {
		const res = await request.get("/api/v2/docs-json");

		const requestBody = res.body.paths["/api/v2/notices"].post.requestBody;
		expect(requestBody).toBeDefined();
		const schemaRef = requestBody.content["application/json"].schema.$ref;
		expect(schemaRef).toBeDefined();
		const schemaName = schemaRef.split("/").pop();
		const schema = res.body.components.schemas[schemaName];
		expect(schema.required).toContain("title");
	});

	it("GET/PUT/DELETE /notices/{id} document the id path parameter as a UUID", async () => {
		const res = await request.get("/api/v2/docs-json");

		const noticeByIdOps = res.body.paths["/api/v2/notices/{id}"];
		for (const method of ["get", "put", "delete"] as const) {
			const idParam = (
				noticeByIdOps[method].parameters as Array<{
					name: string;
					in: string;
					schema?: { format?: string };
				}>
			).find((p) => p.name === "id");
			expect(idParam).toBeDefined();
			expect(idParam?.in).toBe("path");
			expect(idParam?.schema?.format).toBe("uuid");
		}
	});

	it("POST /notices' 201 response has a non-empty schema", async () => {
		const res = await request.get("/api/v2/docs-json");

		const created = res.body.paths["/api/v2/notices"].post.responses["201"];
		expect(created).toBeDefined();
		expect(created.content).toBeDefined();
		const schema = created.content["application/json"].schema;
		expect(schema).toBeDefined();
		expect(Object.keys(schema).length).toBeGreaterThan(0);
	});

	it("the OpenAPI document defines x-auth and omits cookie security scheme", async () => {
		const res = await request.get("/api/v2/docs-json");

		const schemes = res.body.components?.securitySchemes;
		expect(schemes).toBeDefined();
		expect(schemes["x-auth"]).toEqual(
			expect.objectContaining({
				type: "apiKey",
				in: "header",
				name: "X-Auth",
			}),
		);
		// Cookie input is omitted from OpenAPI components to avoid exposing a misleading
		// session cookie paste input in the Authorize modal.
		expect(schemes["cookie"]).toBeUndefined();
	});

	it("every Notices operation lists x-auth in security requirements", async () => {
		const res = await request.get("/api/v2/docs-json");

		const allOps = [
			res.body.paths["/api/v2/notices"].get,
			res.body.paths["/api/v2/notices"].post,
			res.body.paths["/api/v2/notices/{id}"].get,
			res.body.paths["/api/v2/notices/{id}"].put,
			res.body.paths["/api/v2/notices/{id}"].delete,
		];
		for (const op of allOps) {
			expect(op.security).toBeDefined();
			expect(op.security.length).toBeGreaterThanOrEqual(1);
			const securityNames = op.security.flatMap(
				(s: Record<string, unknown[]>) => Object.keys(s),
			);
			expect(securityNames).toContain("x-auth");
			expect(securityNames).not.toContain("cookie");
		}
	});

	// design.md Decision 16: the doc only ever showed success statuses (200/201/204) —
	// none of the error responses these endpoints actually produce.
	it("every Notices operation documents its 401 response", async () => {
		const res = await request.get("/api/v2/docs-json");

		const allOps = [
			res.body.paths["/api/v2/notices"].get,
			res.body.paths["/api/v2/notices"].post,
			res.body.paths["/api/v2/notices/{id}"].get,
			res.body.paths["/api/v2/notices/{id}"].put,
			res.body.paths["/api/v2/notices/{id}"].delete,
		];
		for (const op of allOps) {
			expect(op.responses["401"]).toBeDefined();
		}
	});

	it("getById/update/remove document their 404 response", async () => {
		const res = await request.get("/api/v2/docs-json");

		const noticeByIdOps = res.body.paths["/api/v2/notices/{id}"];
		for (const method of ["get", "put", "delete"] as const) {
			expect(noticeByIdOps[method].responses["404"]).toBeDefined();
		}
	});

	it("create/update document their 422 response", async () => {
		const res = await request.get("/api/v2/docs-json");

		expect(
			res.body.paths["/api/v2/notices"].post.responses["422"],
		).toBeDefined();
		expect(
			res.body.paths["/api/v2/notices/{id}"].put.responses["422"],
		).toBeDefined();
	});

	// ADR-008: content is no longer locale-resolved, so only the :id-validating
	// operations (getById/update/remove) can 400 — list/create have no 400 source.
	it("id-validating operations document their 400 response; list/create do not", async () => {
		const res = await request.get("/api/v2/docs-json");

		expect(
			res.body.paths["/api/v2/notices/{id}"].get.responses["400"],
		).toBeDefined();
		expect(
			res.body.paths["/api/v2/notices/{id}"].put.responses["400"],
		).toBeDefined();
		expect(
			res.body.paths["/api/v2/notices/{id}"].delete.responses["400"],
		).toBeDefined();
		expect(
			res.body.paths["/api/v2/notices"].get.responses["400"],
		).toBeUndefined();
		expect(
			res.body.paths["/api/v2/notices"].post.responses["400"],
		).toBeUndefined();
	});

	it("GET /notices documents page and pageSize as optional query parameters", async () => {
		const res = await request.get("/api/v2/docs-json");

		const parameters = res.body.paths["/api/v2/notices"].get
			.parameters as Array<{
			name: string;
			in: string;
			required?: boolean;
		}>;
		const page = parameters.find((p) => p.name === "page");
		const pageSize = parameters.find((p) => p.name === "pageSize");
		expect(page).toBeDefined();
		expect(page?.in).toBe("query");
		expect(page?.required).toBeFalsy();
		expect(pageSize).toBeDefined();
		expect(pageSize?.in).toBe("query");
		expect(pageSize?.required).toBeFalsy();
	});
});
