import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Division, DivisionSchema, Station, StationSchema } from "./station.schema";
import { StationsController } from "./stations.controller";
import { StationsService } from "./stations.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Station.name, schema: StationSchema },
      { name: Division.name, schema: DivisionSchema },
    ]),
  ],
  controllers: [StationsController],
  providers: [StationsService],
  exports: [StationsService, MongooseModule],
})
export class StationsModule {}
