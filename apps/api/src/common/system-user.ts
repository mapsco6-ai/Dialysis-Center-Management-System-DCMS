// Every AuditLog row requires a real actorId (FK to User) - there is no
// nullable "no one did this" escape hatch, by design (an audit trail with
// unattributed rows is worse than one that's explicit about automation).
// This account is seeded once (isActive: false, unguessable password, no
// roles) purely as an FK anchor for actions the system itself takes, e.g.
// automatic absence-marking. It can never log in.
export const SYSTEM_USERNAME = "system";
