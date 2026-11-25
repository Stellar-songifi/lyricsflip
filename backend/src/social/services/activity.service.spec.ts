import { Activity, ActivityType } from '../entities/activity.entity';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  it('persists activity metadata against the user id', async () => {
    const activity = new Activity();
    const repository = {
      create: jest.fn().mockReturnValue(activity),
      save: jest.fn().mockResolvedValue(activity),
    };
    const service = new ActivityService(repository as never);

    await service.createActivity({
      type: ActivityType.GAME_PLAYED,
      userId: 'user-id',
      data: { gameId: 'game-id' },
    });

    expect(repository.create).toHaveBeenCalledWith({
      type: ActivityType.GAME_PLAYED,
      userId: 'user-id',
      metadata: { gameId: 'game-id' },
    });
    expect(repository.save).toHaveBeenCalledWith(activity);
  });
});
