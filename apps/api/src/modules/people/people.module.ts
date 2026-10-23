import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PeopleController } from "./people.controller";
import { Person, PersonSchema, Vehicle, VehicleSchema } from "./people.schema";
import { PeopleService } from "./people.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Person.name, schema: PersonSchema },
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
  ],
  controllers: [PeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
