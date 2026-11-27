import { SetMetadata } from "@nestjs/common";
import type { PermissionId } from "~/frontend/user/roles";

export const REQUIRE_PERMISSION_KEY = "require_permission";

export const RequirePermission = (permission: PermissionId) =>
	SetMetadata(REQUIRE_PERMISSION_KEY, permission);
