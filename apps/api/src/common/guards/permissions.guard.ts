import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";
import { ANY_PERMISSIONS_KEY } from "../decorators/require-any-permission.decorator";
import { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyOfPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const hasRequirement =
      (requiredPermissions && requiredPermissions.length > 0) ||
      (anyOfPermissions && anyOfPermissions.length > 0);
    if (!hasRequirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((permission) => user.permissions.includes(permission));
      if (!hasAll) {
        throw new ForbiddenException(
          `Missing required permission(s): ${requiredPermissions.join(", ")}`,
        );
      }
    }

    if (anyOfPermissions && anyOfPermissions.length > 0) {
      const hasAny = anyOfPermissions.some((permission) => user.permissions.includes(permission));
      if (!hasAny) {
        throw new ForbiddenException(
          `Requires at least one of: ${anyOfPermissions.join(", ")}`,
        );
      }
    }

    return true;
  }
}
