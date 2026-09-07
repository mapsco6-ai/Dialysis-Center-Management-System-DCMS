export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}
