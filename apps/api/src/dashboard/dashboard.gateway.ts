import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OnEvent } from "@nestjs/event-emitter";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";

interface LoginJwtPayload {
  sub: string;
  tokenVersion: number;
}

export interface LiveUpdateEvent {
  entity: "session" | "schedule" | "machine";
}

// Deliberately broadcasts only a category tag ("a machine changed"), never
// the actual clinical/operational data - every connected client reacts by
// re-fetching its own already-permission-gated REST widget, so there is
// nothing here for an unauthorized viewer to intercept even in principle
// (docs/MODULES-SPEC.md Phase 13: "تبث أحداث ... دون تخزين مكرر للبيانات").
// This still requires a valid, live login JWT to connect at all - a
// dropped/deactivated session's socket is disconnected immediately, same
// guarantee as every REST request already gets from JwtStrategy.
@WebSocketGateway({ cors: { origin: "*" } })
export class DashboardGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DashboardGateway.name);
  private readonly jwtService: JwtService;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {
    // Same JWT_SECRET as the real login token (unlike Phase 7's deliberately
    // distinct PIN-proof secret) - this must accept the exact same token a
    // client already holds from POST /auth/login, not a different kind of
    // credential.
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET as string });
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.query?.token;
      if (typeof token !== "string" || !token) {
        throw new Error("No token provided");
      }
      const payload = await this.jwtService.verifyAsync<LoginJwtPayload>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
        throw new Error("Invalid or expired session");
      }
    } catch {
      client.disconnect(true);
    }
  }

  @OnEvent("live.update")
  broadcast(payload: LiveUpdateEvent) {
    this.server.emit("live:update", payload);
  }
}
