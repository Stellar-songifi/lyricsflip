@Entity()
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('json')
  structure: any;

  @Column()
  type: string; // QUIZ, CHALLENGE, etc.

  @Column('json')
  rules: any;

  @Column()
  difficultyRange: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// src/content-generator/entities/generated-content.entity.ts
@Entity()
export class GeneratedContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Template)
  template: Template;

  @Column('json')
  content: any;

  @Column()
  difficulty: number;

  @Column()
  status: string; // PENDING, VALIDATED, PUBLISHED

  @Column({ default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;
}