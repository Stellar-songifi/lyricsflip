// import { Injectable } from '@nestjs/common';

// // Service responsible for leaderboard operations.
// @Injectable()
// export class LeaderboardService {
//   // Retrieve the global leaderboard.
//   getLeaderboard() {
//     // Implement get leaderboard logic
//   }

//   // Retrieve the rank of a specific player.
//   getPlayerRank() {
//     // Implement get player rank logic
//   }
// }


import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis/redis.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { LeaderboardEntry } from '../leaderboard-entry.entity';

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(LeaderboardEntry)
    private leaderboardRepository: Repository<LeaderboardEntry>,
    private redisService: RedisService
  ) {}

  // Helper method for caching
  private async getCachedData<T>(key: string, fetchFunction: () => Promise<T>, ttl = 3600): Promise<T> {
    const cachedData = await this.redisService.get(key);
    if (cachedData) return JSON.parse(cachedData);
    
    const freshData = await fetchFunction();
    await this.redisService.set(key, JSON.stringify(freshData), ttl);
    
    return freshData;
  }

  // Retrieve the global leaderboard
  async getLeaderboard() {
    return this.getCachedData('leaderboard:global', () =>
      this.leaderboardRepository.find({ order: { score: 'DESC' }, take: 100 })
    );
  }

  // Retrieve the rank of a specific player
  async getPlayerRank(playerId: string) {
    return this.getCachedData(`leaderboard:rank:${playerId}`, async () => {
      const leaderboard = await this.getLeaderboard(); // Fetch cached leaderboard
      const rank = leaderboard.findIndex(entry => entry.playerId === playerId) + 1;
      return rank > 0 ? { playerId, rank } : null;
    });
  }
}
