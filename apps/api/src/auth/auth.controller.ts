import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TOKEN_COOKIE } from "../common/cookie";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

// The session token is also delivered as an HttpOnly cookie, so page scripts
// (and any XSS in them) never hold it. SameSite=Lax keeps it off cross-site
// POSTs. The token stays in the login response for API clients/scripts that
// send it as a Bearer header.
const cookieMaxAgeMs = () => Number.parseInt(process.env.JWT_EXPIRES_IN ?? "8h", 10) * 60 * 60 * 1000;
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  domain: process.env.COOKIE_DOMAIN || undefined,
});

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.username, dto.password);
    res.cookie(TOKEN_COOKIE, result.accessToken, { ...cookieOptions(), maxAge: cookieMaxAgeMs() });
    return result;
  }

  // Public: queues a reset request for an admin. Same answer whether or not
  // the username exists, so it can't be used to discover accounts.
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.username);
    return { success: true };
  }

  // Bumps tokenVersion, which immediately invalidates every outstanding JWT
  // for this account (not just the one used here) - see jwt.strategy.ts.
  // Refused (409 SHIFT_REPORT_REQUIRED) while a mandatory shift report is due.
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("bearer")
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(user);
    res.clearCookie(TOKEN_COOKIE, cookieOptions());
    return result;
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("bearer")
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    res.clearCookie(TOKEN_COOKIE, cookieOptions());
    return result;
  }

  @Get("me")
  @ApiBearerAuth("bearer")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get("shift-report-status")
  @ApiBearerAuth("bearer")
  @UseGuards(JwtAuthGuard)
  shiftReportStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.shiftReportStatus(user);
  }
}
