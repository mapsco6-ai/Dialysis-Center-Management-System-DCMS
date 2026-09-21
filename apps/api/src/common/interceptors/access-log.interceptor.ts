import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { AuditService } from "../../audit/audit.service";
import { ACCESS_ACTION_KEY } from "../decorators/log-access.decorator";

// Writes reads into the append-only audit log so oversight bodies can see
// who opened which chart or exported which report, not only who changed
// data. Runs after the guards (request.user is set) and only on success.
// A failed audit write is logged but never turns a completed read into a 500.
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string | undefined>(ACCESS_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        if (!user) return;
        const patientId: string | undefined = request.params?.patientId ?? request.params?.id;
        this.auditService
          .log({
            actorId: user.id,
            actorRole: user.roles[0] ?? "UNKNOWN",
            action,
            entityType: patientId ? "Patient" : "Report",
            entityId: patientId ?? String(request.path),
            newValue: { path: request.path, query: request.query },
            device: request.headers?.["user-agent"],
            ipAddress: request.ip,
          })
          .catch((error) => this.logger.error(`Access audit failed for ${action}: ${error}`));
      }),
    );
  }
}
