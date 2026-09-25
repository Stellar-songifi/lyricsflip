import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PowerUpService } from './power-up.service';
import { CreatePowerUpDto } from './dtos/create-power-up.dto';
import { PurchasePowerUpDto } from './dtos/purchase-power-up.dto';

@ApiTags('power-ups')
@Controller('power-ups')
export class PowerUpController {
  constructor(private readonly powerUpService: PowerUpService) {}

  @Post()
  async createPowerUp(@Body() createPowerUpDto: CreatePowerUpDto) {
    return this.powerUpService.createPowerUp(createPowerUpDto);
  }

  @Post('purchase')
  async purchasePowerUp(user, @Body() purchaseDto: PurchasePowerUpDto) {
    return this.powerUpService.purchasePowerUp(user, purchaseDto);
  }

  @Get('active')
  async getActivePowerUps(user) {
    return this.powerUpService.getActivePowerUps(user);
  }

  @Post('use')
  async usePowerUp(user, @Body('powerUpId') powerUpId: number) {
    await this.powerUpService.usePowerUp(user, powerUpId);
    return { message: 'Power-up used successfully' };
  }
}
