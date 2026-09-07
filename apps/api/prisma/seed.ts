import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { ROLES, PERMISSIONS } from "@dcms/shared";

const prisma = new PrismaClient();

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { module: permission.module, description: permission.description },
      create: permission,
    });
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });
  const allPermissions = await prisma.permission.findMany();

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permission.id },
    });
  }

  const username = process.env.SUPER_ADMIN_USERNAME ?? "admin";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await argon2.hash(password);

  const superAdminUser = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash,
      fullName: "System Administrator",
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: superAdminUser.id, roleId: superAdminRole.id },
    },
    update: {},
    create: { userId: superAdminUser.id, roleId: superAdminRole.id },
  });

  console.log(`Seed complete. Roles: ${ROLES.length}, Permissions: ${allPermissions.length}.`);
  console.log(`SUPER_ADMIN login -> username: "${username}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
