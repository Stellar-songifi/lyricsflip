// src/store/dto/create-item.dto.ts
export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  type: string;

  @IsString()
  image: string;
}