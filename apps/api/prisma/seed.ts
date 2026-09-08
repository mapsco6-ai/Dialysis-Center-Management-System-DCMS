import "dotenv/config";
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
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD must be set (>= 8 chars) - there is no default password anymore. " +
        "Set it in your .env before running the seed.",
    );
  }
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

  // Phase 2: the four fixed shifts (docs/project-plan.md section 5).
  const shifts: { name: "SHIFT_1" | "SHIFT_2" | "SHIFT_3" | "SHIFT_4"; dialysisStart: string; dialysisEnd: string; cleaningStart: string; cleaningEnd: string }[] = [
    { name: "SHIFT_1", dialysisStart: "06:00", dialysisEnd: "10:00", cleaningStart: "10:00", cleaningEnd: "12:00" },
    { name: "SHIFT_2", dialysisStart: "12:00", dialysisEnd: "16:00", cleaningStart: "16:00", cleaningEnd: "18:00" },
    { name: "SHIFT_3", dialysisStart: "18:00", dialysisEnd: "22:00", cleaningStart: "22:00", cleaningEnd: "00:00" },
    { name: "SHIFT_4", dialysisStart: "00:00", dialysisEnd: "04:00", cleaningStart: "04:00", cleaningEnd: "06:00" },
  ];
  for (const shift of shifts) {
    await prisma.shift.upsert({
      where: { name: shift.name },
      update: {},
      create: shift,
    });
  }

  console.log(`Seed complete. Roles: ${ROLES.length}, Permissions: ${allPermissions.length}, Shifts: ${shifts.length}.`);
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
