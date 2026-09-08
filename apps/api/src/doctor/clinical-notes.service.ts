import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateClinicalNoteDto } from "./dto/create-clinical-note.dto";

@Injectable()
export class ClinicalNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPatient(patientId: string) {
    return this.prisma.clinicalNote.findMany({
      where: { patientId },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(patientId: string, dto: CreateClinicalNoteDto, actor: AuthenticatedUser) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    if (dto.sessionId) {
      const session = await this.prisma.dialysisSession.findUnique({ where: { id: dto.sessionId } });
      if (!session) {
        throw new BadRequestException("sessionId does not refer to an existing session");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: { patientId, authorId: actor.id, sessionId: dto.sessionId, text: dto.text },
      });

      await tx.patientTimelineEvent.create({
        data: {
          patientId,
          type: "CLINICAL_NOTE_ADDED",
          payload: { noteId: note.id },
          performedById: actor.id,
          sourceModule: "doctor-orders",
        },
      });

      return note;
    });
  }
}
