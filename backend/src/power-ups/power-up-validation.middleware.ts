import {
  Injectable,
  UnauthorizedException,
  type NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PowerUpService } from './power-up.service';

@Injectable()
export class PowerUpValidationMiddleware implements NestMiddleware {
  constructor(private readonly powerUpService: PowerUpService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = req.user;
    if (!user || !('id' in user) || typeof user.id !== 'string') {
      return next(new UnauthorizedException());
    }

    const activePowerUps = await this.powerUpService.getActivePowerUps({
      id: user.id,
    });

    // Add active power-ups to the request object for use in controllers
    req['activePowerUps'] = activePowerUps;

    next();
  }
}
