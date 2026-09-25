@Processor('content-generation')
export class ContentQueueProcessor {
  constructor(private contentGeneratorService: ContentGeneratorService) {}

  @Process('validate')
  async validateContent(job: Job<{ contentId: string }>) {
    await this.contentGeneratorService.validateContent(job.data.contentId);
  }
}