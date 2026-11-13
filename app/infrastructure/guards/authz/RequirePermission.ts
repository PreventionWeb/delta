import { SetMetadata } from "@nestjs/common";
import type { PermissionId } from "~/frontend/user/roles";

export const PERMISSIONS_KEY = "required_permissions";

/**
 * Decorates a controller method or class with required permissions.
 * Evaluated by PermissionsGuard.
 */
export const RequirePermission = (...permissions: PermissionId[]) =>
	SetMetadata(PERMISSIONS_KEY, permissions);
