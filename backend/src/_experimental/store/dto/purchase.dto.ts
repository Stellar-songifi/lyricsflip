// src/store/dto/purchase.dto.ts
export class PurchaseDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}