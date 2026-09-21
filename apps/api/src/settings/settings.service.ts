import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

// Every switch the super admin can flip, with its type check and default.
// Unknown keys are rejected so a typo can never silently create a setting.
const DEFINITIONS = {
  shiftReportRequired: {
    default: false,
    description: "Employees must submit a shift report before signing out after working",
    valid: (v: unknown) => typeof v === "boolean",
  },
  auditRetentionYears: {
    default: 10,
    description: "Years the audit trail must be kept (records are archived by export, never deleted)",
    valid: (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50,
  },
} as const;

export type SettingKey = keyof typeof DEFINITIONS;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get<T = unknown>(key: SettingKey): Promise<T> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return (row ? row.value : DEFINITIONS[key].default) as T;
  }

  async getAll() {
    const rows = await this.prisma.systemSetting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    return (Object.keys(DEFINITIONS) as SettingKey[]).map((key) => ({
      key,
      value: stored.has(key) ? stored.get(key) : DEFINITIONS[key].default,
      description: DEFINITIONS[key].description,
    }));
  }

  async set(key: string, value: unknown, actor: AuthenticatedUser) {
    const definition = (DEFINITIONS as Record<string, (typeof DEFINITIONS)[SettingKey]>)[key];
    if (!definition) throw new BadRequestException(`Unknown setting '${key}'`);
    if (!definition.valid(value)) throw new BadRequestException(`Invalid value for '${key}'`);

    const before = await this.get(key as SettingKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key },
        update: { value: value as never, updatedById: actor.id },
        create: { key, value: value as never, updatedById: actor.id },
      });
      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "SETTING_CHANGED",
          entityType: "SystemSetting",
          entityId: key,
          oldValue: { value: before },
          newValue: { value },
        },
        tx,
      );
    });
    return { key, value };
  }
}
