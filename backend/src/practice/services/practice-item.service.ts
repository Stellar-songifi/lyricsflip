// src/practice/services/practice-item.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PracticeItem } from '../entities/practice-item.entity';
import { CreatePracticeItemDto } from '../dto/create-practice-item.dto';
import { UpdatePracticeItemDto } from '../dto/update-practice-item.dto';
import { Difficulty } from '../enums/difficulty.enum';
import { Genre } from '../../songs/enums/genre.enum';

@Injectable()
export class PracticeItemService {
  constructor(
    @InjectRepository(PracticeItem)
    private itemRepository: Repository<PracticeItem>,
  ) {}

  async create(createPracticeItemDto: CreatePracticeItemDto): Promise<PracticeItem> {
    const item = this.itemRepository.create(createPracticeItemDto);
    return this.itemRepository.save(item);
  }

  async findAll(): Promise<PracticeItem[]> {
    return this.itemRepository.find({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<PracticeItem> {
    const item = await this.itemRepository.findOne({
      where: { id, isActive: true },
    });

    if (!item) {
      throw new NotFoundException(`Practice item with ID ${id} not found`);
    }

    return item;
  }

  async update(id: string, updatePracticeItemDto: UpdatePracticeItemDto): Promise<PracticeItem> {
    const item = await this.findOne(id);
    
    // Update item properties
    Object.assign(item, updatePracticeItemDto);
    
    return this.itemRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    item.isActive = false;
    await this.itemRepository.save(item);
  }

  async getItemsByDifficultyAndGenre(
    difficulty: Difficulty,
    genre: Genre,
    limit: number = 10,
  ): Promise<PracticeItem[]> {
    return this.itemRepository.find({
      where: {
        difficulty,
        genre,
        isActive: true,
      },
      take: limit,
    });
  }

  async getRecommendedItems(userId: string, limit: number = 5): Promise<PracticeItem[]> {
    // In a real implementation, this would use the user's progress data
    // to recommend items based on their strengths and weaknesses
    // For now, we'll just return random items
    return this.itemRepository.find({
      where: { isActive: true },
      take: limit,
      order: { id: 'DESC' },
    });
  }
}
