import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { User } from '../user.entity';
import { UserService } from './user.service';

describe('UserService username updates', () => {
  let service: UserService;
  let user: User;
  let repository: {
    findOneByOrFail: jest.Mock;
    update: jest.Mock;
  };
  let usernameValidator: { validate: jest.Mock };

  beforeEach(() => {
    user = Object.assign(new User(), {
      id: 'user-id',
      username: 'new-name',
      avatar: null,
    });
    repository = {
      findOneByOrFail: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(undefined),
    };
    usernameValidator = { validate: jest.fn().mockResolvedValue(undefined) };
    service = new UserService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      usernameValidator as never,
    );
  });

  it('normalises and persists the username for the authenticated user', async () => {
    await service.setUsername('user-id', 'New-Name');

    expect(usernameValidator.validate).toHaveBeenCalledWith(
      'new-name',
      'user-id',
    );
    expect(repository.update).toHaveBeenCalledWith('user-id', {
      username: 'new-name',
    });
    expect(repository.findOneByOrFail).toHaveBeenCalledWith({ id: 'user-id' });
  });

  it('rejects usernames rejected by the validator', async () => {
    usernameValidator.validate.mockRejectedValue(
      new ConflictException('taken'),
    );

    await expect(service.setUsername('user-id', 'taken')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('translates a unique-index violation into a conflict', async () => {
    const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
    (error as unknown as { driverError: { code: string } }).driverError = {
      code: '23505',
    };
    repository.update.mockRejectedValue(error);

    await expect(service.setUsername('user-id', 'taken')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
