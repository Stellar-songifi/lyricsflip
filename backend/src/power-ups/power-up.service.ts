import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions } from 'typeorm';
import { PowerUp } from './entities/power-up.entity';
import { PowerUpPurchase } from './entities/power-up-purchase.entity';
import { CreatePowerUpDto } from './dtos/create-power-up.dto';
import { UpdatePowerUpDto } from './dtos/update-power-up.dto';
import { PurchasePowerUpDto } from './dtos/purchase-power-up.dto';
import { User } from '@app/user/user.entity';

@Injectable()
export class PowerUpService {
  constructor(
    @InjectRepository(PowerUp)
    private powerUpRepository: Repository<PowerUp>,
    @InjectRepository(PowerUpPurchase)
    private powerUpPurchaseRepository: Repository<PowerUpPurchase>,
  ) {}

  async createPowerUp(createPowerUpDto: CreatePowerUpDto): Promise<PowerUp> {
    try {
      const powerUp = this.powerUpRepository.create(createPowerUpDto);
      return await this.powerUpRepository.save(powerUp);
    } catch (error) {
      throw new InternalServerErrorException('Failed to create power-up');
    }
  }

  async getAllPowerUps(): Promise<PowerUp[]> {
    try {
      return await this.powerUpRepository.find();
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve power-ups');
    }
  }

  async getPowerUpById(id: number): Promise<PowerUp> {
    const powerUp = await this.powerUpRepository.findOne({
      where: { id },
    } as FindOneOptions<PowerUp>);
    if (!powerUp) {
      throw new NotFoundException(`Power-up with ID ${id} not found`);
    }
    return powerUp;
  }

  async updatePowerUp(
    id: number,
    updatePowerUpDto: UpdatePowerUpDto,
  ): Promise<PowerUp> {
    const powerUp = await this.getPowerUpById(id);
    Object.assign(powerUp, updatePowerUpDto);
    try {
      return await this.powerUpRepository.save(powerUp);
    } catch (error) {
      throw new InternalServerErrorException('Failed to update power-up');
    }
  }

  async deletePowerUp(id: number): Promise<void> {
    const result = await this.powerUpRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Power-up with ID ${id} not found`);
    }
  }

  async purchasePowerUp(
    user: User,
    purchaseDto: PurchasePowerUpDto,
  ): Promise<PowerUpPurchase> {
    const powerUp = await this.getPowerUpById(purchaseDto.powerUpId);

    const purchase = new PowerUpPurchase();
    purchase.powerUp = powerUp;
    purchase.user = user;
    purchase.purchaseDate = new Date();
    purchase.expirationDate = new Date(
      Date.now() + powerUp.duration * 60 * 60 * 1000,
    ); // Convert hours to milliseconds

    try {
      return await this.powerUpPurchaseRepository.save(purchase);
    } catch (error) {
      throw new InternalServerErrorException('Failed to purchase power-up');
    }
  }

  async getActivePowerUps(user: User): Promise<PowerUpPurchase[]> {
    try {
      return await this.powerUpPurchaseRepository.find({
        where: {
          user: { id: user.id },
          isUsed: false,
        },
        relations: ['powerUp'],
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve active power-ups',
      );
    }
  }

  async usePowerUp(user: User, powerUpId: number): Promise<void> {
    // const purchase = await this.powerUpPurchaseRepository.findOne({
    //   where: {
    //     user: { id: user.id },
    //     powerUp: { id: powerUpId },
    //     isUsed: false,
    //     expirationDate: { $gt: new Date() },
    //   },
    // } as FindOneOptions<PowerUpPurchase>);

    if (false) {
      throw new NotFoundException('Active power-up not found');
    }

    let purchase = true;
    try {
      await this.powerUpPurchaseRepository.save(null);
    } catch (error) {
      throw new InternalServerErrorException('Failed to use power-up');
    }
  }

  async getPowerUpPurchaseHistory(user: User): Promise<PowerUpPurchase[]> {
    try {
      return await this.powerUpPurchaseRepository.find({
        where: { user: { id: user.id } },
        relations: ['powerUp'],
        order: { purchaseDate: 'DESC' },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve purchase history',
      );
    }
  }

  async checkPowerUpAvailability(
    user: User,
    powerUpId: number,
  ): Promise<boolean> {
    // const activePowerUp = await this.powerUpPurchaseRepository.findOne({
    //   where: {
    //     user: { id: user.id },
    //     powerUp: { id: powerUpId },
    //     isUsed: false,
    //     expirationDate: { $gt: new Date() },
    //   },
    // } as FindOneOptions<PowerUpPurchase>);

    // return !!activePowerUp;
    return;
  }

  async extendPowerUpDuration(
    purchaseId: number,
    extensionHours: number,
  ): Promise<PowerUpPurchase> {
    const purchase = await this.powerUpPurchaseRepository.findOne({
      where: { id: purchaseId },
    } as FindOneOptions<PowerUpPurchase>);
    if (!purchase) {
      throw new NotFoundException(
        `Power-up purchase with ID ${purchaseId} not found`,
      );
    }

    if (purchase.isUsed || purchase.expirationDate < new Date()) {
      throw new BadRequestException(
        'Cannot extend an expired or used power-up',
      );
    }

    purchase.expirationDate = new Date(
      purchase.expirationDate.getTime() + extensionHours * 60 * 60 * 1000,
    );

    try {
      return await this.powerUpPurchaseRepository.save(purchase);
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to extend power-up duration',
      );
    }
  }

  async getPowerUpStats(): Promise<any> {
    try {
      const totalPowerUps = await this.powerUpRepository.count();
      const totalPurchases = await this.powerUpPurchaseRepository.count();
      const activePurchases = await this.powerUpPurchaseRepository.count({
        where: {
          isUsed: false,
        },
      });

      const popularPowerUps = await this.powerUpPurchaseRepository
        .createQueryBuilder('purchase')
        .select('powerUp.name', 'name')
        .addSelect('COUNT(*)', 'count')
        .innerJoin('purchase.powerUp', 'powerUp')
        .groupBy('powerUp.id')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany();

      return {
        totalPowerUps,
        totalPurchases,
        activePurchases,
        popularPowerUps,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve power-up statistics',
      );
    }
  }
}
