import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";
import { CreateLabTestDto } from "./dto/create-lab-test.dto";
import { CreateLabPanelDto } from "./dto/create-lab-panel.dto";

@Injectable()
export class LabCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async createTest(dto: CreateLabTestDto) {
    if (dto.consumableItemId) {
      const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.consumableItemId } });
      if (!item) {
        throw new BadRequestException("consumableItemId does not refer to an existing inventory item");
      }
    }
    try {
      return await this.prisma.labTest.create({
        data: {
          code: dto.code,
          name: dto.name,
          unit: dto.unit,
          referenceRangeLow: dto.referenceRangeLow,
          referenceRangeHigh: dto.referenceRangeHigh,
          consumableItemId: dto.consumableItemId,
          consumableQuantity: dto.consumableQuantity ?? 1,
        },
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "code")) {
        throw new ConflictException("A lab test with this code already exists");
      }
      throw error;
    }
  }

  async listTests() {
    return this.prisma.labTest.findMany({ orderBy: { name: "asc" } });
  }

  async createPanel(dto: CreateLabPanelDto) {
    const uniqueTestIds = [...new Set(dto.labTestIds)];
    const count = await this.prisma.labTest.count({ where: { id: { in: uniqueTestIds } } });
    if (count !== uniqueTestIds.length) {
      throw new BadRequestException("One or more labTestIds do not exist");
    }

    try {
      return await this.prisma.labPanel.create({
        data: {
          name: dto.name,
          tests: { create: uniqueTestIds.map((labTestId) => ({ labTestId })) },
        },
        include: { tests: { include: { labTest: true } } },
      });
    } catch (error) {
      if (isUniqueConstraintOn(error, "name")) {
        throw new ConflictException("A lab panel with this name already exists");
      }
      throw error;
    }
  }

  async listPanels() {
    return this.prisma.labPanel.findMany({
      include: { tests: { include: { labTest: true } } },
      orderBy: { name: "asc" },
    });
  }
}
