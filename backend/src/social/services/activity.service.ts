import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity, ActivityType } from '../entities/activity.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  async createActivity(params: {
    type: ActivityType;
    userId: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    await this.activityRepository.save(
      this.activityRepository.create({
        type: params.type,
        userId: params.userId,
        metadata: params.data,
      }),
    );
  }
}
