import { Body, Controller, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PinService } from "./pin.service";
import { SetPinDto } from "./dto/set-pin.dto";
import { VerifyPinDto } from "./dto/verify-pin.dto";

@Controller("nursing")
export class PinController {
  constructor(private readonly pinService: PinService) {}

  // Self-service, own account only - matches the password-change pattern
  // of requiring nothing beyond being logged in as yourself.
  @Patch("my-pin")
  @UseGuards(JwtAuthGuard)
  setMyPin(@Body() dto: SetPinDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pinService.setMyPin(actor, dto.pin);
  }

  // Identifies WHO is physically acting on a shared, already-logged-in
  // device (docs/PROJECT-PHASES-PLAN.md Phase 7: "PIN سريع بعد الدخول
  // الأساسي") - still requires the device's own session to be authenticated;
  // this resolves an identity to attach to the next action, it is not a
  // second login.
  @Post("verify-pin")
  @UseGuards(JwtAuthGuard)
  verify(@Body() dto: VerifyPinDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pinService.verify(actor.id, dto.username, dto.pin);
  }
}
