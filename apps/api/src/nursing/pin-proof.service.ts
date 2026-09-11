import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";

const PROOF_TYPE = "pin-proof";
const PROOF_TTL_SECONDS = 120;

interface PinProofPayload {
  typ: typeof PROOF_TYPE;
  verifiedUserId: string;
  deviceActorId: string;
  jti: string;
  deviceTokenVersion: number;
  verifiedTokenVersion: number;
  exp?: number;
}

// Closes DCMS-055: a bare `verifiedActorId` in the request body was
// trivially forgeable - sessions.service.ts only checked that the referenced
// user existed and held the right permission, never that a PIN was actually
// entered for them. This turns a one-off PIN check into a short-lived,
// signed, single-use proof bound to the device's own session (deviceActorId
// is the caller's real JWT sub, not something the client can pick). The
// proof is signed with a secret distinct from the login JWT (see
// nursing.module.ts) so it can never double as - or be forged from - a
// regular auth token.
@Injectable()
export class PinProofService {
  constructor(private readonly jwtService: JwtService, private readonly prisma: PrismaService) {}

  async issue(verifiedUserId: string, deviceActorId: string): Promise<string> {
    const [device, verified] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: deviceActorId } }),
      this.prisma.user.findUnique({ where: { id: verifiedUserId } }),
    ]);
    if (!device?.isActive || !verified?.isActive) throw new UnauthorizedException("Account is inactive");
    const payload: PinProofPayload = {
      typ: PROOF_TYPE, verifiedUserId, deviceActorId, jti: randomUUID(),
      deviceTokenVersion: device.tokenVersion, verifiedTokenVersion: verified.tokenVersion,
    };
    return this.jwtService.signAsync(payload, { expiresIn: `${PROOF_TTL_SECONDS}s` });
  }

  // Verifies signature/expiry, requires the proof be redeemed by the exact
  // device session it was issued to, and rejects a proof already consumed
  // once - a stolen or replayed token buys nothing.
  async consume(token: string, deviceActorId: string): Promise<string> {
    let payload: PinProofPayload;
    try {
      payload = await this.jwtService.verifyAsync<PinProofPayload>(token);
    } catch {
      throw new UnauthorizedException("verifiedActorToken is invalid or expired");
    }
    if (payload.typ !== PROOF_TYPE || typeof payload.jti !== "string" || !payload.jti ||
        typeof payload.verifiedUserId !== "string" || !Number.isFinite(payload.exp)) {
      throw new UnauthorizedException("verifiedActorToken is invalid or expired");
    }
    if (payload.deviceActorId !== deviceActorId) {
      throw new UnauthorizedException("verifiedActorToken was not issued to this session");
    }
    const [device, verified] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: deviceActorId } }),
      this.prisma.user.findUnique({ where: { id: payload.verifiedUserId } }),
    ]);
    if (!device?.isActive || !verified?.isActive || device.tokenVersion !== payload.deviceTokenVersion ||
        verified.tokenVersion !== payload.verifiedTokenVersion) {
      throw new UnauthorizedException("verifiedActorToken was revoked");
    }
    await this.prisma.pinProofConsumption.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    try {
      await this.prisma.pinProofConsumption.create({ data: { id: payload.jti, expiresAt: new Date(payload.exp! * 1000) } });
    } catch (error) {
      if (isUniqueConstraintOn(error, "id")) throw new UnauthorizedException("verifiedActorToken has already been used");
      throw error;
    }
    return payload.verifiedUserId;
  }
}
