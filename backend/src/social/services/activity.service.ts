import { Injectable } from '@nestjs/common';
import { ActivityType } from '../entities/activity.entity';

@Injectable()
export class ActivityService {
  async create(data: { type: ActivityType; userId: string; data?: any }): Promise<void> {
    // Stub: activity creation will be implemented when persistence layer is added
  }
}
