import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { CalendarService } from "./calendar.service";
import { CalendarController } from "./calendar.controller";

@Module({
  imports: [TasksModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
