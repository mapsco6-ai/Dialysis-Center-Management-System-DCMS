import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";

const PROOF_TYPE = "pin-proof";
const PROOF_TTL_SECONDS = 120;

interface PinProofPayload {
  typ: typeof PROOF_TYPE;
  verifiedUserId: string;
  deviceActorId: string;
  jti: string;
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
  private readonly usedJti = new Map<string, number>();

  constructor(private readonly jwtService: JwtService) {}

  private sweepExpired(now: number) {
    for (const [jti, expiresAt] of this.usedJti) {
      if (expiresAt <= now) this.usedJti.delete(jti);
    }
  }

  async issue(verifiedUserId: string, deviceActorId: string): Promise<string> {
    const payload: PinProofPayload = { typ: PROOF_TYPE, verifiedUserId, deviceActorId, jti: randomUUID() };
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
    if (payload.typ !== PROOF_TYPE) {
      throw new UnauthorizedException("verifiedActorToken is invalid or expired");
    }
    if (payload.deviceActorId !== deviceActorId) {
      throw new UnauthorizedException("verifiedActorToken was not issued to this session");
    }
    const now = Date.now();
    this.sweepExpired(now);
    if (this.usedJti.has(payload.jti)) {
      throw new UnauthorizedException("verifiedActorToken has already been used");
    }
    this.usedJti.set(payload.jti, now + PROOF_TTL_SECONDS * 1000);
    return payload.verifiedUserId;
  }
}
