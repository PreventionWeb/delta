import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleFileRequest } from "~/components/ContentRepeater/FileViewer";
import { ContentRepeaterUploadFile } from "~/components/ContentRepeater/UploadFile";
import {
	BASE_UPLOAD_PATH,
	HAZARDOUS_EVENT_UPLOAD_PATH,
	TEMP_UPLOAD_PATH,
} from "~/utils/paths";

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
			path.join(dirA, "report..v2.pdf"),
			Buffer.from("%PDF-1.4 DOTS"),
		);
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

	it("serves stored slash-prefixed keys belonging to the active tenant and rejects foreign tenant keys", async () => {
		const ownStoredKey = `/${BASE_UPLOAD_PATH}/tenant-${tenantA}/hazardous-event/allowed.pdf`;
		const resOwn = await handleFileRequest(
			new Request(
				`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent(ownStoredKey)}`,
			),
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{ countryAccountsId: tenantA },
		);
		expect(resOwn.status).toBe(200);
		expect(await resOwn.text()).toBe("%PDF-1.4 A");

		const dotsRes = await handleFileRequest(
			new Request(
				`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent("report..v2.pdf")}`,
			),
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{ countryAccountsId: tenantA },
		);
		expect(dotsRes.status).toBe(200);
		expect(await dotsRes.text()).toBe("%PDF-1.4 DOTS");

		const foreignStoredKey = `/${BASE_UPLOAD_PATH}/tenant-${tenantB}/hazardous-event/secret-b.pdf`;
		const resForeign = await handleFileRequest(
			new Request(
				`http://localhost:3000/en/hazardous-event/file-viewer?name=${encodeURIComponent(foreignStoredKey)}`,
			),
			HAZARDOUS_EVENT_UPLOAD_PATH,
			false,
			{ countryAccountsId: tenantA },
		);
		expect(resForeign.status).toBe(400);
	});

	it("ContentRepeaterUploadFile confines save and delete operations strictly to the active tenant", () => {
		const tempA = path.join(rootA, "temp");
		const tempB = path.join(rootB, "temp");
		fs.mkdirSync(tempA, { recursive: true });
		fs.mkdirSync(tempB, { recursive: true });

		const tenantATempFile = path.join(tempA, "123_own.pdf");
		const tenantBTempFile = path.join(tempB, "999_other.pdf");
		fs.writeFileSync(tenantATempFile, Buffer.from("tenant-a-data"));
		fs.writeFileSync(tenantBTempFile, Buffer.from("tenant-b-data"));

		// Missing tenant identifier must fail closed
		expect(() =>
			ContentRepeaterUploadFile.save(
				[{ file: { name: "123_own.pdf", content_type: "application/pdf" } }],
				TEMP_UPLOAD_PATH,
				"/uploads/disaster-event/ev1",
				process.cwd(),
				undefined,
			),
		).toThrow();

		// Untrusted tenantPath pointing to tenant B must not move tenant B's temp file
		ContentRepeaterUploadFile.save(
			[
				{
					file: {
						name: "999_other.pdf",
						content_type: "application/pdf",
						tenantPath: `/${BASE_UPLOAD_PATH}/tenant-${tenantB}`,
					},
				},
			],
			TEMP_UPLOAD_PATH,
			"/uploads/disaster-event/ev1",
			process.cwd(),
			tenantA,
		);
		expect(fs.existsSync(tenantBTempFile)).toBe(true);

		// Legitimate tenant A temp file moves into tenant A destination
		const saved = ContentRepeaterUploadFile.save(
			[{ file: { name: "123_own.pdf", content_type: "application/pdf" } }],
			TEMP_UPLOAD_PATH,
			"/uploads/disaster-event/ev2",
			process.cwd(),
			tenantA,
		);
		expect(fs.existsSync(tenantATempFile)).toBe(false);
		expect(saved[0].file?.name).toBe(
			`/${BASE_UPLOAD_PATH}/tenant-${tenantA}/disaster-event/ev2/own.pdf`,
		);
		expect(fs.existsSync(path.join(rootA, "disaster-event/ev2/own.pdf"))).toBe(
			true,
		);

		// Delete must not remove tenant B's files via untrusted tenantPath or traversal
		ContentRepeaterUploadFile.delete(
			[
				{
					file: {
						name: `/${BASE_UPLOAD_PATH}/tenant-${tenantB}/hazardous-event/secret-b.pdf`,
						tenantPath: `/${BASE_UPLOAD_PATH}/tenant-${tenantB}`,
					},
				},
				{
					file: {
						name: `../tenant-${tenantB}/hazardous-event/secret-b.pdf`,
					},
				},
			],
			process.cwd(),
			tenantA,
		);
		expect(fs.existsSync(path.join(dirB, "secret-b.pdf"))).toBe(true);

		// Delete removes tenant A's own file
		ContentRepeaterUploadFile.delete(
			[{ file: { name: saved[0].file!.name } }],
			process.cwd(),
			tenantA,
		);
		expect(fs.existsSync(path.join(rootA, "disaster-event/ev2/own.pdf"))).toBe(
			false,
		);
	});
});
