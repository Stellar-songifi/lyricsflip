// src/practice/services/practice-progress.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PracticeProgress } from '../entities/practice-progress.entity';
import { PracticeSession } from '../entities/practice-session.entity';
import { PracticeResult } from '../entities/practice-result.entity';
import { Genre } from '../../songs/enums/genre.enum';
import { User } from '../../user/user.entity';

@Injectable()
export class PracticeProgressService {
  constructor(
    @InjectRepository(PracticeProgress)
    private progressRepository: Repository<PracticeProgress>,
    @InjectRepository(PracticeResult)
    private resultRepository: Repository<PracticeResult>,
  ) {}

  async getUserProgress(userId: string, genre?: Genre): Promise<PracticeProgress[]> {
    const query = { user: { id: userId } };
    
    if (genre) {
      query['genre'] = genre;
    }
    
    return this.progressRepository.find({
      where: query,
      order: { genre: 'ASC' },
    });
  }

  async updateProgressAfterSession(session: PracticeSession): Promise<PracticeProgress> {
    const userId = session.user.id;
    const genre = session.genre;
    
    // Get session results
    const results = await this.resultRepository.find({
      where: { session: { id: session.id } },
      relations: ['practiceItem'],
    });
    
    if (results.length === 0) {
      return null;
    }
    
    // Get or create progress record
    let progress = await this.progressRepository.findOne({
      where: { user: { id: userId }, genre },
    });
    
    if (!progress) {
      progress = this.progressRepository.create({
        user: { id: userId } as User,
        genre,
        totalSessions: 0,
        totalItems: 0,
        correctAnswers: 0,
        averageScore: 0,
        averageTimePerItem: 0,
        masteredItems: 0,
        strengthsBySubcategory: {},
        weaknessesBySubcategory: {},
        learningPath: [],
      });
    }
    
    // Update progress statistics
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const totalTime = results.reduce((sum, result) => sum + result.timeSpentSeconds, 0);
    const correctItems = results.filter(result => result.score >= 90).length;
    
    // Update existing values
    const oldTotalItems = progress.totalItems;
    const oldCorrectAnswers = progress.correctAnswers;
    const oldTotalTime = progress.averageTimePerItem * oldTotalItems;
    const oldTotalScore = progress.averageScore * oldTotalItems;
    
    // Calculate new values
    progress.totalSessions += 1;
    progress.totalItems += results.length;
    progress.correctAnswers += correctItems;
    
    const newTotalScore = oldTotalScore + totalScore;
    const newTotalTime = oldTotalTime + totalTime;
    
    progress.averageScore = newTotalScore / progress.totalItems;
    progress.averageTimePerItem = newTotalTime / progress.totalItems;
    
    // Update subcategory strengths and weaknesses
    this.updateSubcategoryStats(progress, results);
    
    // Calculate mastered items (items with score >= 90 on multiple attempts)
    // This is simplified and would be more complex in a real implementation
    const masteryThreshold = 90;
    progress.masteredItems = results.filter(
      result => result.score >= masteryThreshold
    ).length;
    
    // Generate learning path recommendations
    this.generateLearningPath(progress, results);
    
    return this.progressRepository.save(progress);
  }

  private updateSubcategoryStats(
    progress: PracticeProgress,
    results: PracticeResult[],
  ): void {
    const subcategoryScores = {};
    const subcategoryCounts = {};
    
    for (const result of results) {
      const subcategory = result.practiceItem.metadata.subcategory;
      
      if (subcategory) {
        if (!subcategoryScores[subcategory]) {
          subcategoryScores[subcategory] = 0;
          subcategoryCounts[subcategory] = 0;
        }
        
        subcategoryScores[subcategory] += result.score;
        subcategoryCounts[subcategory] += 1;
      }
    }
    
    // Calculate average score per subcategory
    const subcategoryAverages = {};
    
    for (const [subcategory, totalScore] of Object.entries(subcategoryScores)) {
      subcategoryAverages[subcategory] = totalScore / subcategoryCounts[subcategory];
    }
    
    // Merge with existing data
    for (const [subcategory, average] of Object.entries(subcategoryAverages)) {
      progress.strengthsBySubcategory[subcategory] = 
        progress.strengthsBySubcategory[subcategory] 
          ? (progress.strengthsBySubcategory[subcategory] + average) / 2
          : average;
    }
    
    // Update strengths and weaknesses
    const strengths = {};
    const weaknesses = {};
    
    for (const [subcategory, score] of Object.entries(progress.strengthsBySubcategory)) {
      if (score >= 80) {
        strengths[subcategory] = score;
      } else if (score < 60) {
        weaknesses[subcategory] = score;
      }
    }
    
    progress.strengthsBySubcategory = strengths;
    progress.weaknessesBySubcategory = weaknesses;
  }

  private generateLearningPath(
    progress: PracticeProgress,
    results: PracticeResult[],
  ): void {
    // A simple algorithm to generate a learning path based on weak areas
    const weakAreas = Object.keys(progress.weaknessesBySubcategory)
      .sort((a, b) => 
        progress.weaknessesBySubcategory[a] - progress.weaknessesBySubcategory[b]
      );
    
    if (weakAreas.length > 0) {
      progress.learningPath = weakAreas.map(area => 
        `Practice ${area} to improve your skills`
      );
    } else {
      progress.learningPath = ['Continue practicing to maintain your skills'];
    }
  }
}
