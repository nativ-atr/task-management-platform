import { expect, test } from '@playwright/test';

const users = [
  { id: '11111111-1111-4111-8111-111111111111', displayName: 'Avery' },
  { id: '22222222-2222-4222-8222-222222222222', displayName: 'Blake' },
];

const taskTypes = [
  {
    key: 'procurement',
    label: 'Procurement',
    initialStatus: 1,
    finalStatus: 1,
    statuses: [{ status: 1, label: 'Ready', fields: [] }],
  },
  {
    key: 'development',
    label: 'Development',
    initialStatus: 1,
    finalStatus: 2,
    statuses: [
      { status: 1, label: 'Created', fields: [] },
      { status: 2, label: 'Released', fields: [] },
    ],
  },
];

const developmentLifecycleTypes = [
  {
    key: 'development',
    label: 'Development',
    initialStatus: 1,
    finalStatus: 4,
    statuses: [
      { status: 1, label: 'Created', fields: [] },
      {
        status: 2,
        label: 'Specification completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'specification',
            label: 'Specification',
            required: true,
            minLength: 1,
          },
        ],
      },
      {
        status: 3,
        label: 'Development completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'branchName',
            label: 'Branch name',
            required: true,
            minLength: 1,
          },
        ],
      },
      {
        status: 4,
        label: 'Distribution completed',
        fields: [{ kind: 'TEXT', name: 'version', label: 'Version', required: true, minLength: 1 }],
      },
    ],
  },
];

const complianceLifecycleTypes = [
  {
    key: 'compliance',
    label: 'Compliance',
    initialStatus: 1,
    finalStatus: 5,
    statuses: [
      { status: 1, label: 'Created', fields: [] },
      {
        status: 2,
        label: 'Intake completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'caseReference',
            label: 'Case reference',
            required: true,
            minLength: 1,
          },
        ],
      },
      {
        status: 3,
        label: 'Documents verified',
        fields: [
          {
            kind: 'TEXT',
            name: 'documentNotes',
            label: 'Document notes',
            required: true,
            minLength: 1,
          },
        ],
      },
      {
        status: 4,
        label: 'Compliance review completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'reviewNotes',
            label: 'Review notes',
            required: true,
            minLength: 1,
          },
        ],
      },
      {
        status: 5,
        label: 'Approval completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'approvalReference',
            label: 'Approval reference',
            required: true,
            minLength: 1,
          },
        ],
      },
    ],
  },
];

type FieldDefinition =
  | { kind: 'TEXT'; name: string; label: string; required: true; minLength: number }
  | {
      kind: 'FIXED_STRING_ARRAY';
      name: string;
      label: string;
      required: true;
      exactItems: number;
      itemMinLength: number;
    };

type TaskState = 'OPEN' | 'CLOSED';
type Task = {
  id: string;
  type: string;
  typeLabel: string;
  currentStatus: number;
  currentStatusLabel: string;
  state: TaskState;
  assignedUser: (typeof users)[number];
  effectiveData: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  availableActions: {
    transitions: Array<{
      action: 'TRANSITION';
      method: 'POST';
      href: string;
      expectedVersion: number;
      targetStatus: number;
      targetLabel: string;
      direction: 'FORWARD' | 'BACKWARD';
      requiredFields: FieldDefinition[];
      currentValues: Record<string, unknown>;
    }>;
    close: null | {
      action: 'CLOSE';
      method: 'POST';
      href: string;
      expectedVersion: number;
    };
  };
};

type TaskEvent = {
  id: string;
  taskId: string;
  eventType: 'TASK_CREATED' | 'STATUS_CHANGED' | 'TASK_CLOSED';
  fromStatus: number | null;
  toStatus: number;
  fromAssignedUserId: string | null;
  toAssignedUserId: string;
  payload: Record<string, unknown>;
  taskVersion: number;
  requestId: string;
  occurredAt: string;
};

function openTask(id: string, assignedUser = users[0]!, updatedAt = '2026-01-02T00:00:00.000Z') {
  return {
    id,
    type: 'procurement',
    typeLabel: 'Procurement',
    currentStatus: 1,
    currentStatusLabel: 'Ready',
    state: 'OPEN',
    assignedUser,
    effectiveData: {},
    version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    closedAt: null,
    availableActions: {
      transitions: [],
      close: {
        action: 'CLOSE',
        method: 'POST',
        href: `/api/v1/tasks/${id}/close`,
        expectedVersion: 3,
      },
    },
  } satisfies Task;
}

function closedTask(id: string, updatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    id,
    type: 'development',
    typeLabel: 'Development',
    currentStatus: 2,
    currentStatusLabel: 'Released',
    state: 'CLOSED',
    assignedUser: users[1]!,
    effectiveData: { 2: {} },
    version: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    closedAt: updatedAt,
    availableActions: { transitions: [], close: null },
  } satisfies Task;
}

function createdDevelopment(id: string, assignedUser = users[1]!) {
  return {
    id,
    type: 'development',
    typeLabel: 'Development',
    currentStatus: 1,
    currentStatusLabel: 'Created',
    state: 'OPEN',
    assignedUser,
    effectiveData: {},
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    availableActions: {
      transitions: [
        {
          action: 'TRANSITION',
          method: 'POST',
          href: `/api/v1/tasks/${id}/transitions`,
          expectedVersion: 1,
          targetStatus: 2,
          targetLabel: 'Released',
          direction: 'FORWARD',
          requiredFields: [],
          currentValues: {},
        },
      ],
      close: null,
    },
  } satisfies Task;
}

function lifecycleDevelopmentTask(overrides: Partial<Task> = {}) {
  const base = {
    id: 'task-development-lifecycle',
    type: 'development',
    typeLabel: 'Development',
    currentStatus: 1,
    currentStatusLabel: 'Created',
    state: 'OPEN',
    assignedUser: users[0]!,
    effectiveData: {},
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    closedAt: null,
    availableActions: {
      transitions: [],
      close: null,
    },
    ...overrides,
  } satisfies Task;
  return withDevelopmentActions(base);
}

function withDevelopmentActions(task: Task): Task {
  if (task.state === 'CLOSED')
    return { ...task, availableActions: { transitions: [], close: null } };
  const statuses = developmentLifecycleTypes[0]!.statuses;
  const nextStatus = statuses.find((status) => status.status === task.currentStatus + 1);
  return {
    ...task,
    currentStatusLabel:
      statuses.find((status) => status.status === task.currentStatus)?.label ??
      task.currentStatusLabel,
    availableActions: {
      transitions: nextStatus
        ? [
            {
              action: 'TRANSITION',
              method: 'POST',
              href: `/api/v1/tasks/${task.id}/transitions`,
              expectedVersion: task.version,
              targetStatus: nextStatus.status,
              targetLabel: nextStatus.label,
              direction: 'FORWARD',
              requiredFields: nextStatus.fields,
              currentValues: {},
            },
          ]
        : [],
      close:
        task.currentStatus === 4
          ? {
              action: 'CLOSE',
              method: 'POST',
              href: `/api/v1/tasks/${task.id}/close`,
              expectedVersion: task.version,
            }
          : null,
    },
  };
}

function createdCompliance(id: string, assignedUser = users[0]!) {
  return withComplianceActions(
    {
      id,
      type: 'compliance',
      typeLabel: 'Compliance',
      currentStatus: 1,
      currentStatusLabel: 'Created',
      state: 'OPEN',
      assignedUser,
      effectiveData: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      availableActions: {
        transitions: [],
        close: null,
      },
    },
    {},
  );
}

function withComplianceActions(
  task: Task,
  storedData: Record<number, Record<string, unknown>>,
): Task {
  if (task.state === 'CLOSED')
    return { ...task, availableActions: { transitions: [], close: null } };
  const definition = complianceLifecycleTypes[0]!;
  const statuses = definition.statuses;
  const transitions = statuses
    .filter(
      (status) =>
        status.status === task.currentStatus + 1 ||
        (status.status > 0 && status.status < task.currentStatus),
    )
    .map((status) => ({
      action: 'TRANSITION',
      method: 'POST',
      href: `/api/v1/tasks/${task.id}/transitions`,
      expectedVersion: task.version,
      targetStatus: status.status,
      targetLabel: status.label,
      direction: status.status > task.currentStatus ? 'FORWARD' : 'BACKWARD',
      requiredFields: status.fields,
      currentValues: storedData[status.status] ?? {},
    }));
  return {
    ...task,
    currentStatusLabel:
      statuses.find((status) => status.status === task.currentStatus)?.label ??
      task.currentStatusLabel,
    availableActions: {
      transitions,
      close:
        task.currentStatus === definition.finalStatus
          ? {
              action: 'CLOSE',
              method: 'POST',
              href: `/api/v1/tasks/${task.id}/close`,
              expectedVersion: task.version,
            }
          : null,
    },
  } satisfies Task;
}

function lifecycleEvent(
  task: Task,
  eventType: TaskEvent['eventType'],
  payload: Record<string, unknown>,
  fromStatus: number | null,
) {
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    eventType,
    fromStatus,
    toStatus: task.currentStatus,
    fromAssignedUserId: null,
    toAssignedUserId: task.assignedUser.id,
    payload,
    taskVersion: task.version,
    requestId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  } satisfies TaskEvent;
}

test('browses, filters, creates, closes, and replaces selection', async ({ page }) => {
  let tasks = [openTask('task-open-a'), closedTask('task-closed-b')];
  const requests: string[] = [];

  await page.route('**/api/v1/task-types', async (route) =>
    route.fulfill({ json: { items: taskTypes } }),
  );
  await page.route('**/api/v1/users', async (route) => route.fulfill({ json: { items: users } }));
  await page.route('**/api/v1/tasks/*/events', async (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route('**/api/v1/tasks/*/close', async (route) => {
    const id = route
      .request()
      .url()
      .match(/tasks\/([^/]+)\/close/)?.[1];
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      await route.fulfill({ status: 404, json: { error: { message: 'Not found' } } });
      return;
    }
    task.state = 'CLOSED';
    task.closedAt = new Date().toISOString();
    task.updatedAt = task.closedAt;
    task.version += 1;
    task.availableActions = { transitions: [], close: null };
    await route.fulfill({ json: task });
  });
  await page.route('**/api/v1/tasks?**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const state = url.searchParams.get('state') ?? 'ALL';
    const assignedUserId = url.searchParams.get('assignedUserId');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const cursor = Number(url.searchParams.get('cursor') ?? '0');
    const filtered = tasks
      .filter((task) => state === 'ALL' || task.state === state)
      .filter((task) => !assignedUserId || task.assignedUser.id === assignedUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    await route.fulfill({
      json: {
        items: filtered.slice(cursor, cursor + limit),
        nextCursor: cursor + limit < filtered.length ? String(cursor + limit) : null,
        totalCount: filtered.length,
      },
    });
  });
  await page.route('**/api/v1/tasks', async (route) => {
    const body = (await route.request().postDataJSON()) as { type: string; assignedUserId: string };
    const user = users.find((item) => item.id === body.assignedUserId)!;
    const task = createdDevelopment('task-created', user);
    tasks = [task, ...tasks];
    await route.fulfill({ status: 201, json: task });
  });

  await page.goto('/');
  await expect(page.getByText('Task filters')).toBeVisible();
  await expect(page.getByText('2 tasks')).toBeVisible();
  await expect(page.locator('.taskRow.selected')).toContainText('#task-open-a');
  await expect(page.locator('.detail')).toContainText('#task-open-a');
  expect(requests).toContain('?state=ALL&limit=20');
  await page.setViewportSize({ width: 390, height: 820 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('button', { name: /new task/i }).click();
  await expect(page.getByRole('dialog', { name: 'New Task' })).toBeVisible();
  await page.getByLabel('Task type').selectOption('development');
  await page.getByLabel('Initial assignee').selectOption(users[1]!.id);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByRole('dialog', { name: 'New Task' })).toBeHidden();
  await expect(page.getByText('2 tasks')).toBeVisible();
  await expect(page.locator('.taskRow.selected')).toContainText('Development');
  await expect(page.locator('.taskRow.selected')).toContainText('#task-created');
  await expect(page.locator('.detail')).toContainText('#task-created');
  await expect(page.locator('.taskRow.selected')).toContainText('OPEN');
  await expect(page.locator('.detail')).toContainText('Assignee:');
  await expect(page.locator('.detail')).toContainText('Blake');

  await page.getByLabel('Assignee').selectOption(users[0]!.id);
  await expect(page.getByText('1 task')).toBeVisible();
  await expect(page.locator('.taskRow.selected')).toContainText('Avery');
  expect(requests).toContain(`?state=OPEN&limit=20&assignedUserId=${users[0]!.id}`);

  await page.locator('label.segment').filter({ hasText: 'Closed' }).click();
  await expect(page.getByText('No tasks match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('3 tasks')).toBeVisible();

  await page.locator('.taskRow').filter({ hasText: 'Procurement' }).click();
  await page.getByRole('button', { name: 'Close task' }).click();
  await expect(page.locator('.taskRow.selected')).toHaveClass(/state-closed/);
  await expect(page.locator('.taskRow.selected')).toContainText('CLOSED');
  await expect(page.getByText('Read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close task' })).toBeHidden();

  await page.locator('label.segment').filter({ hasText: 'Open' }).click();
  await expect(page.locator('.taskRow.selected')).toContainText('OPEN');
  await expect(page.locator('.detail')).not.toContainText('Procurement');
});

test('completes Development distribution with explicit version and closes without payload changes', async ({
  page,
}) => {
  let task = lifecycleDevelopmentTask();
  const events: TaskEvent[] = [lifecycleEvent(task, 'TASK_CREATED', {}, null)];

  await page.route('**/api/v1/task-types', async (route) =>
    route.fulfill({ json: { items: developmentLifecycleTypes } }),
  );
  await page.route('**/api/v1/users', async (route) => route.fulfill({ json: { items: users } }));
  await page.route('**/api/v1/tasks/*/events', async (route) =>
    route.fulfill({ json: { items: events, nextCursor: null } }),
  );
  await page.route('**/api/v1/tasks/*/transitions', async (route) => {
    const body = (await route.request().postDataJSON()) as {
      targetStatus: number;
      nextAssignedUserId: string;
      data: Record<string, unknown>;
    };
    const fromStatus = task.currentStatus;
    const assignee = users.find((user) => user.id === body.nextAssignedUserId)!;
    task = withDevelopmentActions({
      ...task,
      currentStatus: body.targetStatus,
      assignedUser: assignee,
      effectiveData: { ...task.effectiveData, [body.targetStatus]: body.data },
      version: task.version + 1,
      updatedAt: new Date().toISOString(),
    });
    events.push(lifecycleEvent(task, 'STATUS_CHANGED', body.data, fromStatus));
    await route.fulfill({ json: task });
  });
  await page.route('**/api/v1/tasks/*/close', async (route) => {
    task = withDevelopmentActions({
      ...task,
      state: 'CLOSED',
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: task.version + 1,
    });
    events.push(lifecycleEvent(task, 'TASK_CLOSED', {}, task.currentStatus));
    await route.fulfill({ json: task });
  });
  await page.route('**/api/v1/tasks?**', async (route) =>
    route.fulfill({ json: { items: [task], nextCursor: null, totalCount: 1 } }),
  );

  await page.goto('/');
  await expect(page.locator('.metadata')).toContainText(/Version:\s*1/);

  await page.getByRole('button', { name: /continue to specification completed/i }).click();
  let dialog = page.getByRole('dialog', { name: 'Specification completed' });
  await dialog.getByRole('textbox', { name: 'Specification' }).fill('spec');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to development completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Development completed' });
  await dialog.getByRole('textbox', { name: 'Branch name' }).fill('feature/version-check');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to distribution completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Distribution completed' });
  const versionInput = dialog.getByRole('textbox', { name: 'Version' });
  await expect(versionInput).toHaveValue('');
  await versionInput.fill('9.8.7');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await expect(page.locator('.metadata')).toContainText(/Version:\s*4/);
  await expect(page.locator('.history')).toContainText('Moved to Distribution completed');
  await expect(page.locator('.history')).toContainText('Version');
  await expect(page.locator('.history')).toContainText('9.8.7');
  await expect(page.locator('body')).not.toContainText('1.2.3');

  await page.getByRole('button', { name: 'Close task' }).click();
  await expect(page.locator('.metadata')).toContainText(/Version:\s*5/);
  const closeEntry = page.locator('.event').filter({ hasText: 'Task closed' });
  await expect(closeEntry).toBeVisible();
  await expect(closeEntry).not.toContainText('Version');
  await expect(page.locator('.history')).toContainText('9.8.7');
});

test('creates and completes a Compliance task with generated metadata-driven controls', async ({
  page,
}) => {
  let storedData: Record<number, Record<string, unknown>> = {};
  let task = createdCompliance('task-compliance-lifecycle');
  const events: TaskEvent[] = [];

  await page.route('**/api/v1/task-types', async (route) =>
    route.fulfill({ json: { items: complianceLifecycleTypes } }),
  );
  await page.route('**/api/v1/users', async (route) => route.fulfill({ json: { items: users } }));
  await page.route('**/api/v1/tasks/*/events', async (route) =>
    route.fulfill({ json: { items: events, nextCursor: null } }),
  );
  await page.route('**/api/v1/tasks', async (route) => {
    const body = (await route.request().postDataJSON()) as { type: string; assignedUserId: string };
    const user = users.find((item) => item.id === body.assignedUserId)!;
    task = createdCompliance('task-compliance-lifecycle', user);
    events.push(lifecycleEvent(task, 'TASK_CREATED', {}, null));
    await route.fulfill({ status: 201, json: task });
  });
  await page.route('**/api/v1/tasks/*/transitions', async (route) => {
    const body = (await route.request().postDataJSON()) as {
      targetStatus: number;
      nextAssignedUserId: string;
      data: Record<string, unknown>;
    };
    const fromStatus = task.currentStatus;
    const assignee = users.find((user) => user.id === body.nextAssignedUserId)!;
    storedData = { ...storedData, [body.targetStatus]: body.data };
    task = withComplianceActions(
      {
        ...task,
        currentStatus: body.targetStatus,
        assignedUser: assignee,
        effectiveData: Object.fromEntries(
          Object.entries(storedData).filter(([status]) => Number(status) <= body.targetStatus),
        ),
        version: task.version + 1,
        updatedAt: new Date().toISOString(),
      },
      storedData,
    );
    events.push(lifecycleEvent(task, 'STATUS_CHANGED', body.data, fromStatus));
    await route.fulfill({ json: task });
  });
  await page.route('**/api/v1/tasks/*/close', async (route) => {
    task = withComplianceActions(
      {
        ...task,
        state: 'CLOSED',
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: task.version + 1,
      },
      storedData,
    );
    events.push(lifecycleEvent(task, 'TASK_CLOSED', {}, task.currentStatus));
    await route.fulfill({ json: task });
  });
  await page.route('**/api/v1/tasks?**', async (route) =>
    route.fulfill({
      json: {
        items: events.length > 0 ? [task] : [],
        nextCursor: null,
        totalCount: events.length > 0 ? 1 : 0,
      },
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /new task/i }).click();
  await page.getByLabel('Task type').selectOption('compliance');
  await page.getByLabel('Initial assignee').selectOption(users[0]!.id);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.locator('.taskRow.selected')).toContainText('Compliance');

  await page.getByRole('button', { name: /continue to intake completed/i }).click();
  let dialog = page.getByRole('dialog', { name: 'Intake completed' });
  await dialog.getByRole('textbox', { name: 'Case reference' }).fill('CASE-1');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to documents verified/i }).click();
  dialog = page.getByRole('dialog', { name: 'Documents verified' });
  await dialog.getByRole('textbox', { name: 'Document notes' }).fill('Initial document notes');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /move back to intake completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Intake completed' });
  await expect(dialog.getByRole('textbox', { name: 'Case reference' })).toHaveValue('CASE-1');
  await dialog.getByRole('textbox', { name: 'Case reference' }).fill('CASE-2');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to documents verified/i }).click();
  dialog = page.getByRole('dialog', { name: 'Documents verified' });
  await expect(dialog.getByRole('textbox', { name: 'Document notes' })).toHaveValue(
    'Initial document notes',
  );
  await dialog.getByRole('textbox', { name: 'Document notes' }).fill('Replacement document notes');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to compliance review completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Compliance review completed' });
  await dialog.getByRole('textbox', { name: 'Review notes' }).fill('Reviewed');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to approval completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Approval completed' });
  await dialog.getByRole('textbox', { name: 'Approval reference' }).fill('APP-1');
  await dialog.getByRole('button', { name: /^save$/i }).click();

  const dataPanel = page.getByRole('group', { name: 'Current task data groups' });
  await expect(page.getByRole('heading', { name: 'Current task data' })).toBeVisible();
  await expect(dataPanel.getByRole('heading', { name: 'Intake completed' })).toBeVisible();
  await expect(dataPanel.getByRole('heading', { name: 'Documents verified' })).toBeVisible();
  await expect(
    dataPanel.getByRole('heading', { name: 'Compliance review completed' }),
  ).toBeVisible();
  await expect(dataPanel.getByRole('heading', { name: 'Approval completed' })).toBeVisible();
  await expect(dataPanel).toContainText('CASE-2');
  await expect(dataPanel).toContainText('Replacement document notes');
  await expect(dataPanel).toContainText('Reviewed');
  await expect(dataPanel).toContainText('APP-1');
  await expect(dataPanel).not.toContainText('{');
  await page.setViewportSize({ width: 390, height: 820 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(page.getByRole('button', { name: 'Close task' })).toBeVisible();
  await page.getByRole('button', { name: 'Close task' }).click();
  await expect(page.getByText('Read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close task' })).toBeHidden();
  await expect(dataPanel).toContainText('Case reference');
  await expect(dataPanel).toContainText('CASE-2');
  await expect(dataPanel).toContainText('Document notes');
  await expect(dataPanel).toContainText('Replacement document notes');
  await expect(dataPanel).toContainText('Approval reference');
  await expect(dataPanel).toContainText('APP-1');
  await expect(page.locator('.history')).toContainText('Moved to Approval completed');
  await expect(page.locator('.history')).toContainText('Task closed');
});
