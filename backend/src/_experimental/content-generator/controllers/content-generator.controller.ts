// src/content-generator/controllers/content-generator.controller.ts
@Controller('content-generator')
export class ContentGeneratorController {
  constructor(private contentGeneratorService: ContentGeneratorService) {}

  @Post('generate')
  async generateContent(
    @Body() generateDto: GenerateContentDto
  ): Promise<GeneratedContent> {
    return this.contentGeneratorService.generateContent(
      generateDto.templateId,
      generateDto.options
    );
  }

  @Get('content')
  async getContent(
    @Query() filters: ContentFilters
  ): Promise<GeneratedContent[]> {
    return this.contentGeneratorService.getGeneratedContent(filters);
  }

  @Post('templates')
  async createTemplate(
    @Body() createTemplateDto: CreateTemplateDto
  ): Promise<Template> {
    return this.contentGeneratorService.createTemplate(createTemplateDto);
  }
}