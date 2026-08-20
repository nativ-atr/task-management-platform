import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1723970000000 implements MigrationInterface {
  name = 'InitialSchema1723970000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        current_status integer NOT NULL CHECK (current_status > 0),
        assigned_user_id uuid NOT NULL REFERENCES users(id),
        custom_data_by_status jsonb NOT NULL DEFAULT '{}'::jsonb,
        closed_at timestamptz NULL,
        version integer NOT NULL CHECK (version > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_tasks_assignee_state_updated
      ON tasks (assigned_user_id, closed_at, updated_at DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE task_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES tasks(id),
        event_type text NOT NULL CHECK (event_type IN ('TASK_CREATED', 'STATUS_CHANGED', 'TASK_CLOSED')),
        from_status integer NULL CHECK (from_status IS NULL OR from_status > 0),
        to_status integer NOT NULL CHECK (to_status > 0),
        from_assignee_id uuid NULL REFERENCES users(id),
        to_assignee_id uuid NOT NULL REFERENCES users(id),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        task_version integer NOT NULL CHECK (task_version > 0),
        request_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_task_events_task_order ON task_events (task_id, created_at ASC, id ASC)
    `);
    await queryRunner.query(`
      CREATE TABLE idempotency_records (
        key text PRIMARY KEY,
        request_fingerprint text NOT NULL,
        status text NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
        response_status integer NULL,
        response_body jsonb NULL,
        locked_until timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL,
        expires_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_idempotency_expires_at ON idempotency_records (expires_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS idempotency_records');
    await queryRunner.query('DROP TABLE IF EXISTS task_events');
    await queryRunner.query('DROP TABLE IF EXISTS tasks');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}
