import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { StationsModule } from "../stations/stations.module";
import { StaffUser, StaffUserSchema } from "../users/user.schema";
import { AccessGuard } from "./access.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CryptoService } from "./crypto.service";
import { StaffSession, StaffSessionSchema } from "./session.schema";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Global()
@Module({
  imports: [
    StationsModule,
    MongooseModule.forFeature([
      { name: StaffUser.name, schema: StaffUserSchema },
      { name: StaffSession.name, schema: StaffSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CryptoService,
    SessionsService,
    TokensService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [CryptoService, SessionsService, MongooseModule],
})
export class AuthModule {}
