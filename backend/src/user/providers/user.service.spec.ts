import { ConflictException, NotFoundException } from '@nestjs/common';
import { User } from '../user.entity';
import { UserService } from './user.service';

describe('UserService profile updates', () => {
  let service: UserService;
  let user: User;
  let repository: {
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    user = Object.assign(new User(), {
      id: 'user-id',
      username: 'old-name',
      avatar: null,
    });
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repository = {
      findOneBy: jest.fn().mockResolvedValue(user),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    service = new UserService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
    );
  });

  it('updates the username and avatar for the authenticated user', async () => {
    await service.updateMyProfile('user-id', {
      username: 'new-name',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'LOWER(user.username) = LOWER(:username)',
      { username: 'new-name' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.id != :userId', {
      userId: 'user-id',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'new-name',
        avatar: 'https://example.com/avatar.png',
      }),
    );
  });

  it('rejects usernames already used by another account', async () => {
    queryBuilder.getOne.mockResolvedValue(
      Object.assign(new User(), { id: 'other-user' }),
    );

    await expect(
      service.updateMyProfile('user-id', { username: 'taken' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects updates for a missing user', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(
      service.updateMyProfile('missing-user', { username: 'new-name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
