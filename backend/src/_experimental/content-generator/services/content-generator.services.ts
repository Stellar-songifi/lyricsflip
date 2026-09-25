@Injectable()
export class ContentGeneratorService {
  constructor(
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
    @InjectRepository(GeneratedContent)
    private contentRepository: Repository<GeneratedContent>,
    @InjectQueue('content-generation')
    private contentQueue: Queue,
    private validationService: ValidationService
  ) {}

  async generateContent(
    templateId: string,
    options: GenerationOptions
  ): Promise<GeneratedContent> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Generate content based on template
    const content = await this.applyTemplate(template, options);

    // Create initial content record
    const generatedContent = this.contentRepository.create({
      template,
      content,
      difficulty: options.difficulty,
      status: 'PENDING'
    });

    await this.contentRepository.save(generatedContent);

    // Queue for validation
    await this.contentQueue.add('validate', {
      contentId: generatedContent.id
    });

    return generatedContent;
  }

  private async applyTemplate(
    template: Template,
    options: GenerationOptions
  ): Promise<any> {
    switch (template.type) {
      case 'QUIZ':
        return this.generateQuiz(template, options);
      case 'CHALLENGE':
        return this.generateChallenge(template, options);
      default:
        throw new BadRequestException('Unsupported template type');
    }
  }

  private async generateQuiz(
    template: Template,
    options: GenerationOptions
  ): Promise<any> {
    // Implement quiz generation logic
    const questions = await this.generateQuestions(
      template.structure,
      options.difficulty
    );

    return {
      type: 'QUIZ',
      questions,
      difficulty: options.difficulty,
      metadata: {
        generatedAt: new Date(),
        templateId: template.id
      }
    };
  }

  async validateContent(contentId: string): Promise<void> {
    const content = await this.contentRepository.findOne({
      where: { id: contentId },
      relations: ['template']
    });

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    const isValid = await this.validationService.validate(
      content.content,
      content.template.rules
    );

    if (isValid) {
      content.status = 'VALIDATED';
      await this.contentRepository.save(content);
    } else {
      // Handle invalid content
      await this.handleInvalidContent(content);
    }
  }

  async getGeneratedContent(
    filters: ContentFilters
  ): Promise<GeneratedContent[]> {
    return this.contentRepository.find({
      where: {
        status: 'VALIDATED',
        difficulty: Between(filters.minDifficulty, filters.maxDifficulty)
      },
      order: {
        createdAt: 'DESC'
      }
    });
  }
}