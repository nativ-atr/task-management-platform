import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

const fetchMock = vi.fn(async () => Response.json({ id: 'task-id' }));
vi.stubGlobal('fetch', fetchMock);

describe('task api', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it('uses the provided idempotency key for create retries', async () => {
    const body = {
      type: 'procurement',
      assignedUserId: '11111111-1111-4111-8111-111111111111',
    };

    await api.createTask(body, 'same-submission-key');
    await api.createTask(body, 'same-submission-key');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/tasks',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'same-submission-key' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/tasks',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'same-submission-key' }),
      }),
    );
  });

  it('normalizes API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: 'VERSION_CONFLICT',
            message: 'The task has changed since it was read.',
            details: {},
            requestId: 'request-1',
          },
        },
        { status: 409 },
      ),
    );

    await expect(api.task('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'The task has changed since it was read.',
      requestId: 'request-1',
    });
  });
});
