import { AuthenticatedUser } from "../common/types/authenticated-user";

type UserWithRoles = {
  id: string;
  username: string;
  fullName: string;
  roles: {
    role: {
      name: string;
      permissions: { permission: { key: string } }[];
    };
  }[];
};

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
