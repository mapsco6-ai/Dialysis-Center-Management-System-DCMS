import { Module } from "@nestjs/common";
import { OversightService } from "./oversight.service";
import { OversightController } from "./oversight.controller";

@Module({ controllers: [OversightController], providers: [OversightService] })
export class OversightModule {}
