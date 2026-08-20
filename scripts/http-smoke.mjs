const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const users = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

async function http(path, { method = 'GET', body, key } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(json)}`);
  }
  return { status: response.status, json, replayed: response.headers.get('Idempotency-Replayed') };
}

async function expectFailure(path, status, code, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    body: JSON.stringify(options.body),
  });
  const json = await response.json();
  if (response.status !== status || json.error?.code !== code) {
    throw new Error(`Expected ${status} ${code}, got ${response.status}: ${JSON.stringify(json)}`);
  }
}

async function runLifecycle(type, steps) {
  const createKey = crypto.randomUUID();
  const created = await http('/api/v1/tasks', {
    method: 'POST',
    key: createKey,
    body: { type, assignedUserId: users[0] },
  });
  const replay = await http('/api/v1/tasks', {
    method: 'POST',
    key: createKey,
    body: { type, assignedUserId: users[0] },
  });
  if (replay.replayed !== 'true' || replay.json.id !== created.json.id) {
    throw new Error('Create idempotency replay failed');
  }
  await expectFailure('/api/v1/tasks', 409, 'IDEMPOTENCY_KEY_REUSED', {
    method: 'POST',
    key: createKey,
    body: { type, assignedUserId: users[1] },
  });

  let task = created.json;
  for (const [targetStatus, data] of steps) {
    const transitioned = await http(`/api/v1/tasks/${task.id}/transitions`, {
      method: 'POST',
      key: crypto.randomUUID(),
      body: {
        targetStatus,
        nextAssignedUserId: users[targetStatus % users.length],
        expectedVersion: task.version,
        data,
      },
    });
    task = transitioned.json;
  }

  await expectFailure(`/api/v1/tasks/${task.id}/transitions`, 409, 'VERSION_CONFLICT', {
    method: 'POST',
    key: crypto.randomUUID(),
    body: {
      targetStatus: task.currentStatus - 1,
      nextAssignedUserId: users[0],
      expectedVersion: 1,
      data: {},
    },
  });

  const closed = await http(`/api/v1/tasks/${task.id}/close`, {
    method: 'POST',
    key: crypto.randomUUID(),
    body: { expectedVersion: task.version },
  });
  if (closed.json.state !== 'CLOSED' || closed.json.availableActions.transitions.length !== 0) {
    throw new Error('Close did not return immutable closed read model');
  }
  await expectFailure(`/api/v1/tasks/${task.id}/close`, 409, 'TASK_CLOSED', {
    method: 'POST',
    key: crypto.randomUUID(),
    body: { expectedVersion: closed.json.version },
  });
  return closed.json.id;
}

await http('/health/ready');
await http('/api/v1/task-types');
await http('/api/v1/users');
const initialPage = await http('/api/v1/tasks?state=ALL&limit=5');
if (typeof initialPage.json.totalCount !== 'number') {
  throw new Error('Generic task list must include totalCount');
}
await runLifecycle('procurement', [
  [2, { quotes: ['quote a', 'quote b'] }],
  [1, {}],
  [2, { quotes: ['quote c', 'quote d'] }],
  [3, { receipt: 'receipt-1' }],
]);
await runLifecycle('development', [
  [2, { specification: 'spec' }],
  [3, { branchName: 'feature/task' }],
  [2, { specification: 'spec revised' }],
  [3, { branchName: 'feature/task-v2' }],
  [4, { version: '9.8.7' }],
]);
await runLifecycle('compliance', [
  [2, { caseReference: 'CASE-1' }],
  [3, { documentNotes: 'Initial document notes' }],
  [2, { caseReference: 'CASE-2' }],
  [3, { documentNotes: 'Replacement document notes' }],
  [4, { reviewNotes: 'reviewed' }],
  [5, { approvalReference: 'APP-1' }],
]);

console.log('HTTP smoke lifecycle passed.');
