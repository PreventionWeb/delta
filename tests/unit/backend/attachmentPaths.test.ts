import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
	assertTenantFileKey,
	deleteTenantPhysicalFileByKey,
	resolveTenantUploadPath,
} from "~/backend.server/utils/attachmentPaths.server";
import { BASE_UPLOAD_PATH } from "~/utils/paths";

describe("attachmentPaths tenant boundary", () => {
	const tenantA = `test-att-a-${crypto.randomUUID().slice(0, 8)}`;
	const tenantB = `test-att-b-${crypto.randomUUID().slice(0, 8)}`;
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
	const fileA = path.join(rootA, "disaster-event", "ev1", "a.pdf");
	const fileB = path.join(rootB, "disaster-event", "ev2", "b.pdf");

	beforeAll(() => {
		fs.mkdirSync(path.dirname(fileA), { recursive: true });
		fs.mkdirSync(path.dirname(fileB), { recursive: true });
		fs.writeFileSync(fileA, "A");
		fs.writeFileSync(fileB, "B");
	});

	afterAll(() => {
		fs.rmSync(rootA, { recursive: true, force: true });
		fs.rmSync(rootB, { recursive: true, force: true });
	});

	it("accepts a valid fileKey within the caller's tenant directory", () => {
		const key = `/uploads/tenant-${tenantA}/disaster-event/ev1/a.pdf`;
		expect(resolveTenantUploadPath(key, tenantA)).toBe(fileA);
		expect(assertTenantFileKey(key, tenantA)).toBe(key);
	});

	it("rejects another tenant's fileKey and refuses to delete Tenant B's file", () => {
		const tenantBKey = `/uploads/tenant-${tenantB}/disaster-event/ev2/b.pdf`;
		expect(resolveTenantUploadPath(tenantBKey, tenantA)).toBeNull();
		expect(() => assertTenantFileKey(tenantBKey, tenantA)).toThrow(Response);

		deleteTenantPhysicalFileByKey(tenantBKey, tenantA);
		expect(fs.existsSync(fileB)).toBe(true);
	});

	it("rejects path traversal escaping the tenant directory", () => {
		const traversalKey = `/uploads/tenant-${tenantA}/../tenant-${tenantB}/disaster-event/ev2/b.pdf`;
		expect(resolveTenantUploadPath(traversalKey, tenantA)).toBeNull();
		deleteTenantPhysicalFileByKey(traversalKey, tenantA);
		expect(fs.existsSync(fileB)).toBe(true);
	});

	it("deletes a legitimate physical file belonging to the caller's tenant", () => {
		const key = `/uploads/tenant-${tenantA}/disaster-event/ev1/a.pdf`;
		deleteTenantPhysicalFileByKey(key, tenantA);
		expect(fs.existsSync(fileA)).toBe(false);
	});
});
