import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleFileRequest } from "~/components/ContentRepeater/FileViewer";
import { BASE_UPLOAD_PATH, HAZARDOUS_EVENT_UPLOAD_PATH } from "~/utils/paths";

describe("FileViewer path resolution and tenant scoping", () => {
	const tenantA = `test-fv-a-${crypto.randomUUID().slice(0, 8)}`;
	const tenantB = `test-fv-b-${crypto.randomUUID().slice(0, 8)}`;
	const rootA = path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${tenantA}`,
	);
	const rootB = path.resolve(
		process.cwd(),
		BASE_UPLOAD_PATH,
		`tenant-${tenantB}`,
	);
	const dirA = path.join(rootA, "hazardous-event");
	const dirB = path.join(rootB, "hazardous-event");

	beforeAll(() => {
		fs.mkdirSync(dirA, { recursive: true });
		fs.mkdirSync(dirB, { recursive: true });
		fs.writeFileSync(path.join(dirA, "allowed.pdf"), Buffer.from("%PDF-1.4 A"));
		fs.writeFileSync(
			path.join(dirB, "secret-b.pdf"),
			Buffer.from("%PDF-1.4 B"),
		);
	});

	afterAll(() => {
		fs.rmSync(rootA, { recursive: true, force: true });
		fs.rmSync(rootB, { recursive: true, force: true });
	});

	it("serves a legitimate file inside the session tenant directory with nosniff", async () => {
		const req = new Request(
			"http://localhost:3000/en/hazardous-event/file-viewer?name=allowed.pdf",
		);
		const res = await handleFileRequest(
			req,
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{
				countryAccountsId: tenantA,
			},
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(await res.text()).toBe("%PDF-1.4 A");
	});

	it("blocks embedded path traversal to another tenant (a/../../../tenant-B/...)", async () => {
		const traversal = `sub/../../../tenant-${tenantB}/hazardous-event/secret-b.pdf`;
		const req = new Request(
			`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent(traversal)}`,
		);
		const res = await handleFileRequest(
			req,
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{
				countryAccountsId: tenantA,
			},
		);
		expect(res.status).toBe(400);
	});

	it("ignores untrusted tenantPath query parameter pointing to another tenant", async () => {
		const req = new Request(
			`http://localhost:3000/en/hazardous-event/file-viewer?name=secret-b.pdf&tenantPath=${encodeURIComponent(`uploads/tenant-${tenantB}`)}`,
		);
		const res = await handleFileRequest(
			req,
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{
				countryAccountsId: tenantA,
			},
		);
		expect(res.status).toBe(404);
	});

	it("blocks null bytes and absolute paths", async () => {
		const req1 = new Request(
			`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent("allowed.pdf\0.png")}`,
		);
		const res1 = await handleFileRequest(
			req1,
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{
				countryAccountsId: tenantA,
			},
		);
		expect(res1.status).toBe(400);

		const req2 = new Request(
			`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent("/etc/passwd")}`,
		);
		const res2 = await handleFileRequest(
			req2,
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{
				countryAccountsId: tenantA,
			},
		);
		expect(res2.status).toBe(400);
	});
});
