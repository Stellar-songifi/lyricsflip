@Entity()
export class ConfigEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    key: string;

    @Column('json')
    value: any;

    @Column()
    version: number;

    @Column({ default: true })
    isActive: boolean;

    @Column('json', { nullable: true })
    validationRules: any;

    @Column({ nullable: true })
    description: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}