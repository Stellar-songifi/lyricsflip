// src/voice/dto/voice-settings.dto.ts
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class VoiceSettingsDto {
  @IsBoolean()
  @IsOptional()
  muted?: boolean;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  qualityPreference?: 'low' | 'medium' | 'high';

  @IsBoolean()
  @IsOptional()
  isRecording?: boolean;
}

