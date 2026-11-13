import {
	Injectable,
	Inject,
	Optional,
	ForbiddenException,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { roleHasPermission, type PermissionId } from "~/frontend/user/roles";
import { PERMISSIONS_KEY } from "./RequirePermission";
import type { AuthenticatedRequest } from "../types";

/**
 * NestJS authorization guard that validates the authenticated caller's role
 * against permissions declared via `@RequirePermission(...)`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
	private readonly reflector: Reflector;

	constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
		this.reflector = reflector ?? new Reflector();
	}

	canActivate(context: ExecutionContext): boolean {
		const requiredPermissions = this.reflector.getAllAndOverride<
			PermissionId[]
		>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

		// If no permissions are required, allow request to proceed.
		if (!requiredPermissions || requiredPermissions.length === 0) {
			return true;
		}

		const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const userRole = req.role;

		if (!userRole) {
			throw new ForbiddenException("Forbidden");
		}

		const hasAll = requiredPermissions.every((perm) =>
			roleHasPermission(userRole, perm),
		);

		if (!hasAll) {
			throw new ForbiddenException("Forbidden");
		}

		return true;
	}
}
