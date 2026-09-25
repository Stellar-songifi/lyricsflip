@Module({
    imports: [
      TypeOrmModule.forFeature([Template, GeneratedContent, ContentValidation]),
      BullModule.registerQueue({
        name: 'content-generation'
      })
    ],
    controllers: [ContentGeneratorController],
    providers: [
      ContentGeneratorService,
      TemplateService,
      ValidationService,
      ContentQueueProcessor
    ],
    exports: [ContentGeneratorService]
  })
  export class ContentGeneratorModule {}