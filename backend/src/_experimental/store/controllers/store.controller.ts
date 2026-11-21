// src/store/controllers/store.controller.ts
import { ApiTags } from '@nestjs/swagger';

@ApiTags('store')
@Controller('store')
@UseGuards(AuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('items')
  async getItems(@Query() filter: any) {
    return this.storeService.getItems(filter);
  }

  @Post('purchase')
  async purchaseItem(
    @User() user: User,
    @Body() purchaseDto: PurchaseDto
  ) {
    return this.storeService.purchaseItem(user.id, purchaseDto);
  }

  @Get('inventory')
  async getInventory(@User() user: User) {
    return this.storeService.getInventory(user.id);
  }

  @Get('transactions')
  async getTransactions(@User() user: User) {
    return this.storeService.getTransactionHistory(user.id);
  }
}