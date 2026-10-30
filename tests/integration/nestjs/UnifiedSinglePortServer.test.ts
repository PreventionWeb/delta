import "reflect-metadata";

import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createUnifiedServer } from "../../../server";

describe("Unified single-port server", () => {
	let app: Awaited<ReturnType<typeof createUnifiedServer>>["app"];
	let httpServer: { close: () => Promise<void> } | undefined;
	let request: ReturnType<typeof supertest>;

	beforeAll(async () => {
		const server = await createUnifiedServer();
		app = server.app;
		httpServer = await new Promise<{ close: () => Promise<void> }>((resolve) => {
			const listener = app.listen(0, () => resolve(listener));
		});
		request = supertest(app);
	});

	afterAll(async () => {
		await httpServer?.close();
	});

	it("keeps health and readiness endpoints on the unified server", async () => {
		const health = await request.get("/healthz");
		expect(health.status).toBe(200);
		expect(health.body.status).toBe("healthy");

		const ready = await request.get("/readyz");
		expect(ready.status).toBe(200);
		expect(ready.body.status).toBe("ready");
	});

	it("routes API requests through NestJS and not React Router", async () => {
		const canonicalDocs = await request.get("/api/v2/docs");
		expect(canonicalDocs.status).toBe(200);
		expect(canonicalDocs.headers["content-type"]).toMatch(/html|text/);

		const aliasDocs = await request.get("/api/docs");
		expect(aliasDocs.status).toBe(308);
		expect(aliasDocs.headers.location).toBe("/api/v2/docs");
	});

	it("allows non-API requests to fall through to the React Router catch-all", async () => {
		const home = await request.get("/");
		expect(home.status).toBeLessThan(500);
		const deepLink = await request.get("/en/disaster-record");
		expect(deepLink.status).toBeLessThan(500);
	});
});
