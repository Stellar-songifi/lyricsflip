@Module({
    imports: [
        TypeOrmModule.forFeature([ConfigEntry, ConfigAudit]),
        EventEmitterModule.forRoot()
    ],
    controllers: [ConfigManagerController],
    providers: [ConfigManagerService],
    exports: [ConfigManagerService]
})
export class ConfigManagerModule { }