// HTTP settings shared by the server (main.ts) and the API tests.

import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ENV, type Env } from "./config/env";

export function configureApp(app: INestApplication) {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;

  express.set("trust proxy", env.TRUST_PROXY);
  express.disable("x-powered-by");
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-EV-App"],
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  return app;
}
