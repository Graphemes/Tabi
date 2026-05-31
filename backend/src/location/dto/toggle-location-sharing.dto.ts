import { IsBoolean } from 'class-validator';

export class ToggleLocationSharingDto {
  @IsBoolean()
  enabled: boolean;
}
