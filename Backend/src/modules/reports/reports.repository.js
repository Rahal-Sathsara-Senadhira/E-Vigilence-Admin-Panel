import { DB_PROVIDER } from "../../config/env.js";
import mongoRepo from "./repositories/reports.mongo.repo.js";

const repos = { mongo: mongoRepo };

export default repos[DB_PROVIDER] || mongoRepo;
