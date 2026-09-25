
// src/practice/services/practice-result.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PracticeResult } from '../entities/practice-result.entity';
import { PracticeSession } from '../entities/practice-session.entity';
import { PracticeItem } from '../entities/practice-item.entity';
import { User } from '../../user/user.entity';
import { SubmitResultDto } from '../dto/submit-result.dto';
import { FeedbackService } from './feedback.service';

@Injectable()
export class PracticeResultService {
  constructor(
    @InjectRepository(PracticeResult)
    private resultRepository: Repository<PracticeResult>,
    @InjectRepository(PracticeSession)
    private sessionRepository: Repository<PracticeSession>,
    @InjectRepository(PracticeItem)
    private itemRepository: Repository<PracticeItem>,
    private feedbackService: FeedbackService,
  ) {}

  async submitResult(
    user: User,
    sessionId: string,
    itemId: string,
    submitResultDto: SubmitResultDto,
  ): Promise<PracticeResult> {
    // Find session and item
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, user: { id: user.id } },
    });

    if (!session) {
      throw new NotFoundException(`Practice session with ID ${sessionId} not found`);
    }

    const practiceItem = await this.itemRepository.findOne({
      where: { id: itemId, isActive: true },
    });

    if (!practiceItem) {
      throw new NotFoundException(`Practice item with ID ${itemId} not found`);
    }

    // Calculate score based on user response and item solution
    const score = this.calculateScore(practiceItem, submitResultDto.userResponse);

    // Generate feedback
    const feedback = await this.feedbackService.generateFeedback(
      practiceItem,
      submitResultDto.userResponse,
      score,
    );

    // Create and save result
    const result = this.resultRepository.create({
      user,
      session,
      practiceItem,
      score,
      timeSpentSeconds: submitResultDto.timeSpentSeconds,
      userResponse: submitResultDto.userResponse,
      feedback,
    });

    return this.resultRepository.save(result);
  }

  async getResultById(id: string): Promise<PracticeResult> {
    const result = await this.resultRepository.findOne({
      where: { id },
      relations: ['user', 'session', 'practiceItem'],
    });

    if (!result) {
      throw new NotFoundException(`Practice result with ID ${id} not found`);
    }

    return result;
  }

  async getSessionResults(sessionId: string): Promise<PracticeResult[]> {
    return this.resultRepository.find({
      where: { session: { id: sessionId } },
      relations: ['practiceItem'],
      order: { createdAt: 'DESC' },
    });
  }

  async getUserResults(userId: string, limit: number = 20): Promise<PracticeResult[]> {
    return this.resultRepository.find({
      where: { user: { id: userId } },
      relations: ['practiceItem', 'session'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private calculateScore(item: PracticeItem, userResponse: Record<string, any>): number {
    // This would be a more complex implementation based on item type
    // For simplicity, let's implement a basic scoring system
    
    switch (item.type) {
      case ItemType.MULTIPLE_CHOICE: {
        // For multiple choice, check if the selected option matches the correct answer
        const correctOption = item.solution.correctOption;
        const userOption = userResponse.selectedOption;
        return correctOption === userOption ? 100 : 0;
      }
      
      case ItemType.FILL_IN_BLANK: {
        // For fill in the blank, compare user answers with correct answers
        const correctAnswers = item.solution.answers;
        const userAnswers = userResponse.answers;
        
        let correctCount = 0;
        let totalCount = correctAnswers.length;
        
        for (let i = 0; i < totalCount; i++) {
          if (i < userAnswers.length && 
              userAnswers[i].toLowerCase() === correctAnswers[i].toLowerCase()) {
            correctCount++;
          }
        }
        
        return Math.round((correctCount / totalCount) * 100);
      }
      
      case ItemType.MATCHING: {
        // For matching, check how many pairs were correctly matched
        const correctPairs = item.solution.pairs;
        const userPairs = userResponse.pairs;
        
        let correctCount = 0;
        let totalCount = correctPairs.length;
        
        for (const [key, value] of Object.entries(userPairs)) {
          if (correctPairs[key] === value) {
            correctCount++;
          }
        }
        
        return Math.round((correctCount / totalCount) * 100);
      }
      
      // Add more scoring logic for other item types
      
      default:
        // Default scoring (could be improved in a real implementation)
        return 0;
    }
  }
}
