import { Global, Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";

// Makes AuthModuleOptions (needed by every AuthGuard('jwt') instance) available
// app-wide, so feature modules can just @UseGuards(JwtAuthGuard) without also
// importing PassportModule.register(...) themselves.
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" })],
  exports: [PassportModule],
})
export class GlobalPassportModule {}
