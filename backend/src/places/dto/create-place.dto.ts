import { PlaceKind } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePlaceDto {
  @IsString()
  @MaxLength(120)
  name: string;

  /** DESTINATION = somewhere the trip is going; STOP = a waypoint along the way. */
  @IsOptional()
  @IsEnum(PlaceKind)
  kind?: PlaceKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  /** Provider feature id when the pin came from search; omitted for hand-dropped pins. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;
}
