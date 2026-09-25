@Controller('config')
@UseGuards(AuthGuard)
export class ConfigManagerController {
  constructor(private readonly configService: ConfigManagerService) {}

  @Get(':key')
  async getConfig(@Param('key') key: string) {
    return this.configService.get(key);
  }

  @Put(':key')
  @Roles('admin')
  async updateConfig(
    @Param('key') key: string,
    @Body() updateDto: UpdateConfigDto,
    @User() user: UserEntity
  ) {
    return this.configService.set(key, updateDto.value, user.id);
  }

  @Post('rollback/:key')
  @Roles('admin')
  async rollbackConfig(
    @Param('key') key: string,
    @Body() rollbackDto: RollbackConfigDto
  ) {
    return this.configService.rollback(key, rollbackDto.version);
  }

  @Get(':key/history')
  @Roles('admin')
  async getConfigHistory(@Param('key') key: string) {
    return this.configService.getHistory(key);
  }
}