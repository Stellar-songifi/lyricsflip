@Injectable()
export class ConfigManagerService {
  private configCache: Map<string, any> = new Map();

  constructor(
    @InjectRepository(ConfigEntry)
    private configRepository: Repository<ConfigEntry>,
    @InjectRepository(ConfigAudit)
    private auditRepository: Repository<ConfigAudit>,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    const configs = await this.configRepository.find({
      where: { isActive: true }
    });
    configs.forEach(config => {
      this.configCache.set(config.key, config.value);
    });
  }

  async get(key: string): Promise<any> {
    // Try cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    const config = await this.configRepository.findOne({
      where: { key, isActive: true }
    });

    if (!config) {
      throw new NotFoundException(Configuration ${key} not found);
    }

    this.configCache.set(key, config.value);
    return config.value;
  }

  async set(
    key: string,
    value: any,
    userId: string
  ): Promise<ConfigEntry> {
    const existingConfig = await this.configRepository.findOne({
      where: { key }
    });

    if (existingConfig) {
      // Validate new value
      await this.validateConfig(value, existingConfig.validationRules);

      // Create audit entry
      await this.createAudit(
        existingConfig,
        existingConfig.value,
        value,
        userId
      );

      // Update config
      existingConfig.value = value;
      existingConfig.version += 1;
      await this.configRepository.save(existingConfig);

      // Update cache
      this.configCache.set(key, value);

      // Emit event
      this.eventEmitter.emit('config.updated', {
        key,
        value,
        version: existingConfig.version
      });

      return existingConfig;
    }

    // Create new config
    const newConfig = this.configRepository.create({
      key,
      value,
      version: 1
    });

    await this.configRepository.save(newConfig);
    this.configCache.set(key, value);

    return newConfig;
  }

  private async validateConfig(value: any, rules: any): Promise<void> {
    if (!rules) return;

    // Implement validation logic based on rules
    const isValid = await this.runValidation(value, rules);
    if (!isValid) {
      throw new BadRequestException('Invalid configuration value');
    }
  }

  private async createAudit(
    config: ConfigEntry,
    oldValue: any,
    newValue: any,
    userId: string
  ): Promise<void> {
    const audit = this.auditRepository.create({
      config,
      oldValue,
      newValue,
      changedBy: userId
    });

    await this.auditRepository.save(audit);
  }

  async rollback(key: string, version: number): Promise<ConfigEntry> {
    const audits = await this.auditRepository.find({
      where: { config: { key } },
      order: { timestamp: 'DESC' }
    });

    const targetAudit = audits.find(a => a.config.version === version);
    if (!targetAudit) {
      throw new NotFoundException('Version not found');
    }

    return this.set(key, targetAudit.oldValue, 'SYSTEM_ROLLBACK');
  }

  async getHistory(key: string): Promise<ConfigAudit[]> {
    return this.auditRepository.find({
      where: { config: { key } },
      order: { timestamp: 'DESC' }
    });
  }
}