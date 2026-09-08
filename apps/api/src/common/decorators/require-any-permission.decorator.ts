import { SetMetadata } from "@nestjs/common";

export const ANY_PERMISSIONS_KEY = "anyPermissions";

// Unlike @RequirePermissions (all must be held), this passes if the user
// holds at least one - for endpoints legitimately shared by roles with
// otherwise unrelated permission sets (e.g. a schedule view useful to both
// full scheduling managers and reception staff who only check patients in).
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
