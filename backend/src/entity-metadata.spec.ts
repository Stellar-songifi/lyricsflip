import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { DataSource, DefaultNamingStrategy } from 'typeorm';
import { User } from './user/user.entity';
import { Referral } from './referral/entities/referral.entity';
import { Player } from './player/player.entity';
import { ChatRoom } from './chat-room/chat-room.entity';
import { Room } from './room/entities/room.entity';
import { PlayerRoom } from './room/entities/player-room.entity';
import { Notification } from './notification/entities/notification.entity';
import { Song } from './songs/entities/song.entity';
import { Tag } from './songs/entities/tag.entity';
import { UserGenrePreference } from './songs/entities/user-genre-preference.entity';
import { GameSession } from './game-session/game-session.entity';
import { Tournament } from './tournament/tournament.entity';
import { CustomGameMode } from './game/entities/custom-game-mode.entity';

interface EntityDeclaration {
  className: string;
  tableName: string;
  file: string;
}

const namingStrategy = new DefaultNamingStrategy();

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * Finds every `@Entity(...)` class by parsing source rather than importing it,
 * so this covers modules that cannot be loaded yet. Table names are resolved
 * the same way TypeORM does, including the implicit name of `@Entity()`.
 */
function findEntityDeclarations(root: string): EntityDeclaration[] {
  const declarations: EntityDeclaration[] = [];

  for (const file of listTsFiles(root)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const call = decorator.expression;
          if (!ts.isCallExpression(call) || call.expression.getText(source) !== 'Entity') continue;

          const [arg] = call.arguments;
          let explicitName: string | undefined;
          if (arg && ts.isStringLiteralLike(arg)) {
            explicitName = arg.text;
          } else if (arg && ts.isObjectLiteralExpression(arg)) {
            const nameProp = arg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && p.name.getText(source) === 'name',
            );
            if (nameProp && ts.isStringLiteralLike(nameProp.initializer)) {
              explicitName = nameProp.initializer.text;
            }
          }

          declarations.push({
            className: node.name.text,
            tableName: namingStrategy.tableName(node.name.text, explicitName),
            file: relative(root, file),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return declarations;
}

describe('entity metadata', () => {
  it('maps every table to exactly one @Entity', () => {
    const declarations = findEntityDeclarations(__dirname);
    expect(declarations.length).toBeGreaterThan(0);

    const byTable = new Map<string, EntityDeclaration[]>();
    for (const declaration of declarations) {
      byTable.set(declaration.tableName, [...(byTable.get(declaration.tableName) ?? []), declaration]);
    }
    const duplicates = [...byTable.entries()]
      .filter(([, entities]) => entities.length > 1)
      .map(([table, entities]) => `${table}: ${entities.map((e) => `${e.className} (${e.file})`).join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('builds valid TypeORM metadata for the consolidated entities', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [
        User,
        Referral,
        Player,
        ChatRoom,
        Room,
        PlayerRoom,
        Notification,
        Song,
        Tag,
        UserGenrePreference,
        GameSession,
        Tournament,
        CustomGameMode,
      ],
    });

    // Builds and validates metadata without opening a database connection.
    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    const tables = dataSource.entityMetadatas.map((m) => m.tableName);
    expect(new Set(tables).size).toBe(tables.length);
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'players', 'rooms', 'notifications', 'songs', 'game_sessions']),
    );

    const users = dataSource.getMetadata(User);
    const stellarAddress = users.findColumnWithPropertyName('stellarAddress');
    expect(stellarAddress.isNullable).toBe(true);
    expect(users.uniques.some((u) => u.columns.includes(stellarAddress))).toBe(true);
  });
});
