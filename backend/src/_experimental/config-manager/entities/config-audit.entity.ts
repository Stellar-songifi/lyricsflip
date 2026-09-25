@Entity()
export class ConfigAudit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => ConfigEntry)
    config: ConfigEntry;

    @Column('json')
    oldValue: any;

    @Column('json')
    newValue: any;

    @Column()
    changedBy: string;

    @CreateDateColumn()
    timestamp: Date;
}