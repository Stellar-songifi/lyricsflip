import { Injectable, type NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PowerUpService } from './power-up.service';
import { User } from '../user/user.entity';

@Injectable()
export class PowerUpValidationMiddleware implements NestMiddleware {
  constructor(private readonly powerUpService: PowerUpService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = req['user'] as unknown as User;
    const activePowerUps = await this.powerUpService.getActivePowerUps(user);

    // Add active power-ups to the request object for use in controllers
    req['activePowerUps'] = activePowerUps;

    next();
  }
}
