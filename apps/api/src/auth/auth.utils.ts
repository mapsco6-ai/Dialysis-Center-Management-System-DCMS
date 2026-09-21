import { ROLE_TEMPLATES } from "@dcms/shared";
import { AuthenticatedUser } from "../common/types/authenticated-user";

type UserWithRoles = {
  id: string;
  username: string;
  fullName: string;
  mustChangePassword?: boolean;
  roles: {
    role: {
      name: string;
      permissions: { permission: { key: string } }[];
    };
  }[];
};

// First of the user's roles that defines a landing page wins; roles the
// director creates later (no template) fall back to the dashboard.
export function landingPathFor(roles: string[]): string {
  for (const role of roles) {
    const path = ROLE_TEMPLATES[role]?.landingPath;
    if (path) return path;
  }
  return "/admin";
}

export function toAuthenticatedUser(user: UserWithRoles): AuthenticatedUser {
  const roles = user.roles.map((userRole) => userRole.role.name);
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.key),
      ),
    ),
  );

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles,
    permissions,
    landingPath: landingPathFor(roles),
    mustChangePassword: user.mustChangePassword ?? false,
  };
}

export const USER_WITH_ROLES_INCLUDE = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} as const;
