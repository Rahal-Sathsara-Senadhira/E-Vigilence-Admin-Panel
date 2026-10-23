import { Module } from "@nestjs/common";
import { StationsModule } from "../stations/stations.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

// The StaffUser model and the session/crypto services come from the global AuthModule.
@Module({
  imports: [StationsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
