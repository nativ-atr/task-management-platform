import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskListIndexes1723970100000 implements MigrationInterface {
  name = 'TaskListIndexes1723970100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_updated
      ON tasks (updated_at DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_open_updated
      ON tasks (updated_at DESC, id DESC)
      WHERE closed_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_closed_updated
      ON tasks (updated_at DESC, id DESC)
      WHERE closed_at IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_tasks_closed_updated');
    await queryRunner.query('DROP INDEX IF EXISTS idx_tasks_open_updated');
    await queryRunner.query('DROP INDEX IF EXISTS idx_tasks_updated');
  }
}
