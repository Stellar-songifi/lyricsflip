import { PartialType } from '@nestjs/swagger';
import { CreateSongDto } from './create-song.dto';

export class UpdateSongDto extends PartialType(CreateSongDto) {}
