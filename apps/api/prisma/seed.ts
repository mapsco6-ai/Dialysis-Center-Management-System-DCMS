import "dotenv/config";
import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { ROLES, PERMISSIONS, ROLE_TEMPLATES } from "@dcms/shared";
import { SYSTEM_USERNAME } from "../src/common/system-user";

const prisma = new PrismaClient();

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Permissions this run introduces (used below to roll them out to the
  // default roles of existing installs).
  const knownKeys = new Set((await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const newKeys = new Set(PERMISSIONS.map((p) => p.key).filter((key) => !knownKeys.has(key)));

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

  // Default permissions for the other roles. A director's later edits survive
  // every re-seed: a role that already holds permissions only receives
  // permissions that are brand new in this release. Two exceptions:
  //  - AUDITOR (committee account) is locked to its template, so it can never
  //    quietly grow beyond the read-only dashboard;
  //  - RESET_ROLE_TEMPLATES=1 deliberately re-applies every template.
  const resetAll = process.env.RESET_ROLE_TEMPLATES === "1";
  for (const [roleName, template] of Object.entries(ROLE_TEMPLATES)) {
    if (roleName === "SUPER_ADMIN") continue;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const holdsAny = (await prisma.rolePermission.count({ where: { roleId: role.id } })) > 0;
    const locked = roleName === "AUDITOR" || resetAll;
    const wanted = allPermissions.filter(
      (p) => template.permissions.includes(p.key) && (locked || !holdsAny || newKeys.has(p.key)),
    );
    if (locked) await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
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

  // FK anchor for automated actions (see src/common/system-user.ts). Never
  // logs in: isActive is false and the password hash is random/unrecorded.
  await prisma.user.upsert({
    where: { username: SYSTEM_USERNAME },
    update: {},
    create: {
      username: SYSTEM_USERNAME,
      passwordHash: await argon2.hash(crypto.randomBytes(32).toString("hex")),
      fullName: "System (automated)",
      isActive: false,
    },
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

  // Phase 4: fixed stock locations, like Shift.
  await prisma.stockLocation.upsert({
    where: { type: "MAIN_WAREHOUSE" },
    update: {},
    create: { type: "MAIN_WAREHOUSE", name: "المخزن الرئيسي" },
  });

  // Phase 10: pharmacy's own stock pool, fed by a simple transfer from
  // MAIN_WAREHOUSE (docs/PROJECT-PHASES-PLAN.md: "أساس بسيط من الفيز 4،
  // التحويل الكامل في فيز 11").
  await prisma.stockLocation.upsert({
    where: { type: "PHARMACY" },
    update: {},
    create: { type: "PHARMACY", name: "الصيدلية" },
  });

  // Phase 11: the two remaining locations the full multi-location warehouse
  // model (StockTransfer) can now move stock between.
  await prisma.stockLocation.upsert({
    where: { type: "LABORATORY_STOCK" },
    update: {},
    create: { type: "LABORATORY_STOCK", name: "مخزون المختبر" },
  });
  await prisma.stockLocation.upsert({
    where: { type: "WARD_STOCK" },
    update: {},
    create: { type: "WARD_STOCK", name: "مخزون الردهة" },
  });

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
