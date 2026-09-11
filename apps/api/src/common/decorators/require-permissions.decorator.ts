import { applyDecorators, SetMetadata } from "@nestjs/common";
import { ApiExtension } from "@nestjs/swagger";

export const PERMISSIONS_KEY = "permissions";

export const RequirePermissions = (...permissions: string[]) =>
  applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), ApiExtension("x-required-permissions", permissions));
