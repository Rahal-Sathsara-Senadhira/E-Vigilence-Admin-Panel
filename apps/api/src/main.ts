import "./load-env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { ENV, type Env } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  app.get(Logger).log(`E-Vigilance API listening on http://localhost:${env.PORT}/api/v1`);
}

void bootstrap();
