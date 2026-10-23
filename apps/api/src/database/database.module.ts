import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ENV, type Env } from "../config/env";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.MONGODB_URI,
        // Indexes are created at start-up outside production; in production
        // they are created by migrations (docs/14 §5).
        autoIndex: env.NODE_ENV !== "production",
      }),
    }),
  ],
})
export class DatabaseModule {}
