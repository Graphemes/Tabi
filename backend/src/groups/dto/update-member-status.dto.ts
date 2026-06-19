import { IsIn } from 'class-validator';

export class UpdateMemberStatusDto {
  @IsIn(['ACTIVE', 'PENDING', 'ARCHIVED'])
  status: 'ACTIVE' | 'PENDING' | 'ARCHIVED';
}
