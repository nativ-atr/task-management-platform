import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskApp } from './TaskApp.js';
import type { Task } from './types.js';

const users = [
  { id: '11111111-1111-4111-8111-111111111111', displayName: 'Avery' },
  { id: '22222222-2222-4222-8222-222222222222', displayName: 'Blake' },
];
const secondUser = users[1]!;

const taskTypes = [
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
  {
    key: 'procurement',
    label: 'Procurement',
    initialStatus: 1,
    finalStatus: 3,
    statuses: [
      { status: 1, label: 'Created', fields: [] },
      {
        status: 2,
        label: 'Supplier offers received',
        fields: [
          {
            kind: 'FIXED_STRING_ARRAY',
            name: 'quotes',
            label: 'Quotes',
            required: true,
            exactItems: 2,
            itemMinLength: 1,
          },
        ],
      },
      {
        status: 3,
        label: 'Purchase completed',
        fields: [
          {
            kind: 'TEXT',
            name: 'receipt',
            label: 'Receipt',
            required: true,
            minLength: 1,
          },
        ],
      },
    ],
  },
];

const openTask: Task = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'compliance',
  typeLabel: 'Compliance',
  currentStatus: 5,
  currentStatusLabel: 'Approval completed',
  state: 'OPEN',
  assignedUser: users[0]!,
  effectiveData: {
    2: { caseReference: 'CASE-1' },
    3: { documentNotes: 'Documents complete' },
    4: { reviewNotes: 'Reviewed' },
    5: { approvalReference: 'APP-1' },
  },
  version: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  closedAt: null,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions',
        expectedVersion: 5,
        targetStatus: 1,
        targetLabel: 'Created',
        direction: 'BACKWARD',
        requiredFields: [],
        currentValues: {},
      },
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions',
        expectedVersion: 5,
        targetStatus: 2,
        targetLabel: 'Intake completed',
        direction: 'BACKWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'caseReference',
            label: 'Case reference',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: { caseReference: 'CASE-1' },
      },
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions',
        expectedVersion: 5,
        targetStatus: 3,
        targetLabel: 'Documents verified',
        direction: 'BACKWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'documentNotes',
            label: 'Document notes',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: { documentNotes: 'Documents complete' },
      },
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transitions',
        expectedVersion: 5,
        targetStatus: 4,
        targetLabel: 'Compliance review completed',
        direction: 'BACKWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'reviewNotes',
            label: 'Review notes',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: { reviewNotes: 'Reviewed' },
      },
    ],
    close: {
      action: 'CLOSE',
      method: 'POST',
      href: '/api/v1/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/close',
      expectedVersion: 5,
    },
  },
};

const closedTask: Task = {
  ...openTask,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  state: 'CLOSED',
  closedAt: new Date().toISOString(),
  availableActions: { transitions: [], close: null },
};

const complianceCreatedTask: Task = {
  ...openTask,
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  currentStatus: 1,
  currentStatusLabel: 'Created',
  effectiveData: {},
  version: 1,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd/transitions',
        expectedVersion: 1,
        targetStatus: 2,
        targetLabel: 'Intake completed',
        direction: 'FORWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'caseReference',
            label: 'Case reference',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: {},
      },
    ],
    close: null,
  },
};

const complianceIntakeTask: Task = {
  ...complianceCreatedTask,
  currentStatus: 2,
  currentStatusLabel: 'Intake completed',
  effectiveData: { 2: { caseReference: 'CASE-1' } },
  version: 2,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd/transitions',
        expectedVersion: 2,
        targetStatus: 3,
        targetLabel: 'Documents verified',
        direction: 'FORWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'documentNotes',
            label: 'Document notes',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: {},
      },
    ],
    close: null,
  },
};

const complianceDocumentsRevisitTask: Task = {
  ...complianceIntakeTask,
  availableActions: {
    transitions: [
      {
        ...complianceIntakeTask.availableActions.transitions[0]!,
        currentValues: { documentNotes: 'Documents complete' },
      },
    ],
    close: null,
  },
};

const complianceDocumentsTask: Task = {
  ...complianceIntakeTask,
  currentStatus: 3,
  currentStatusLabel: 'Documents verified',
  effectiveData: {
    2: { caseReference: 'CASE-1' },
    3: { documentNotes: 'Documents complete' },
  },
  version: 3,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd/transitions',
        expectedVersion: 3,
        targetStatus: 4,
        targetLabel: 'Compliance review completed',
        direction: 'FORWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'reviewNotes',
            label: 'Review notes',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: {},
      },
    ],
    close: null,
  },
};

const complianceReviewTask: Task = {
  ...complianceDocumentsTask,
  currentStatus: 4,
  currentStatusLabel: 'Compliance review completed',
  effectiveData: {
    ...complianceDocumentsTask.effectiveData,
    4: { reviewNotes: 'Reviewed' },
  },
  version: 4,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd/transitions',
        expectedVersion: 4,
        targetStatus: 5,
        targetLabel: 'Approval completed',
        direction: 'FORWARD',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'approvalReference',
            label: 'Approval reference',
            required: true,
            minLength: 1,
          },
        ],
        currentValues: {},
      },
    ],
    close: null,
  },
};

const developmentReadyTask: Task = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  type: 'development',
  typeLabel: 'Development',
  currentStatus: 3,
  currentStatusLabel: 'Development completed',
  state: 'OPEN',
  assignedUser: users[0]!,
  effectiveData: {
    2: { specification: 'spec' },
    3: { branchName: 'feature/task' },
  },
  version: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  closedAt: null,
  availableActions: {
    transitions: [
      {
        action: 'TRANSITION',
        method: 'POST',
        href: '/api/v1/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/transitions',
        expectedVersion: 3,
        targetStatus: 4,
        targetLabel: 'Distribution completed',
        direction: 'FORWARD',
        requiredFields: [
          { kind: 'TEXT', name: 'version', label: 'Version', required: true, minLength: 1 },
        ],
        currentValues: {},
      },
    ],
    close: null,
  },
};

const developmentRevisitTask: Task = {
  ...developmentReadyTask,
  availableActions: {
    transitions: [
      {
        ...developmentReadyTask.availableActions.transitions[0]!,
        currentValues: { version: '2.4.0' },
      },
    ],
    close: null,
  },
};

const procurementTask: Task = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  type: 'procurement',
  typeLabel: 'Procurement',
  currentStatus: 3,
  currentStatusLabel: 'Purchase completed',
  state: 'OPEN',
  assignedUser: users[0]!,
  effectiveData: {
    2: { quotes: ['QUOTE-1', 'QUOTE-2'] },
    3: { receipt: 'Receipt line 1\nReceipt line 2' },
  },
  version: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  closedAt: null,
  availableActions: { transitions: [], close: null },
};

let listedTasks: Task[] = [openTask];
let transitionBodies: unknown[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input);
  if (path.endsWith('/task-types')) return Response.json({ items: taskTypes });
  if (path.endsWith('/users')) return Response.json({ items: users });
  if (path.startsWith('/api/v1/tasks?')) {
    return Response.json({ items: listedTasks, nextCursor: null, totalCount: listedTasks.length });
  }
  if (path.includes('/events')) {
    return Response.json({
      items: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          taskId: openTask.id,
          eventType: 'STATUS_CHANGED',
          fromStatus: 4,
          toStatus: 5,
          fromAssignedUserId: users[1]!.id,
          toAssignedUserId: users[0]!.id,
          payload: { approvalReference: 'APP-1' },
          taskVersion: 5,
          requestId: 'request-1',
          occurredAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    });
  }
  if (path.includes('/transitions') && init?.method === 'POST') {
    const body = JSON.parse(String(init.body)) as {
      targetStatus: number;
      data: Record<string, unknown>;
    };
    transitionBodies.push(body);
    const currentTask = listedTasks[0];
    if (currentTask?.type === 'compliance') {
      const complianceType = taskTypes[0]!;
      const status = complianceType.statuses.find((item) => item.status === body.targetStatus);
      return Response.json({
        ...currentTask,
        currentStatus: body.targetStatus,
        currentStatusLabel: status?.label ?? currentTask.currentStatusLabel,
        effectiveData:
          Object.keys(body.data).length > 0
            ? { ...currentTask.effectiveData, [body.targetStatus]: body.data }
            : currentTask.effectiveData,
        version: currentTask.version + 1,
      });
    }
    return Response.json({
      ...developmentReadyTask,
      currentStatus: 4,
      currentStatusLabel: 'Distribution completed',
      effectiveData: { ...developmentReadyTask.effectiveData, 4: { version: '2.4.0' } },
      version: 4,
      availableActions: {
        transitions: [
          {
            action: 'TRANSITION',
            method: 'POST',
            href: '/api/v1/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/transitions',
            expectedVersion: 4,
            targetStatus: 3,
            targetLabel: 'Development completed',
            direction: 'BACKWARD',
            requiredFields: [],
            currentValues: developmentReadyTask.effectiveData[3] ?? {},
          },
        ],
        close: {
          action: 'CLOSE',
          method: 'POST',
          href: '/api/v1/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/close',
          expectedVersion: 4,
        },
      },
    });
  }
  if (path === `/api/v1/tasks/${openTask.id}`) return Response.json(openTask);
  return Response.json({});
});

vi.stubGlobal('fetch', fetchMock);

function renderApp(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TaskApp />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('TaskApp', () => {
  beforeEach(() => {
    listedTasks = [openTask];
    transitionBodies = [];
    fetchMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the generic all-tasks endpoint and renders compact filters, count, and rows', async () => {
    renderApp();

    expect(await screen.findByText('Task filters')).toBeInTheDocument();
    expect(await screen.findByText('1 task')).toBeInTheDocument();
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/tasks?state=ALL&limit=20',
        expect.any(Object),
      );
    });
  });

  it('adds assignedUserId only when a specific assignee filter is selected', async () => {
    renderApp();
    await screen.findByText('Blake');
    fireEvent.change(await screen.findByLabelText('Assignee'), {
      target: { value: secondUser.id },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/tasks?state=ALL&limit=20&assignedUserId=${secondUser.id}`,
        expect.any(Object),
      );
    });
  });

  it('renders available actions, grouped current task data, and readable activity', async () => {
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Available actions' })).toBeInTheDocument();
    expect(screen.getAllByText('#aaaaaaaa')).toHaveLength(2);
    expect(screen.getAllByLabelText('Task ID aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toHaveLength(
      2,
    );
    expect(screen.getByRole('button', { name: /move back to created/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /move back to intake completed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /move back to documents verified/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /move back to compliance review completed/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close task/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current task data' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Task data' })).not.toBeInTheDocument();
    const dataPanel = screen.getByRole('group', { name: 'Current task data groups' });
    expect(within(dataPanel).queryByRole('heading', { name: 'Created' })).not.toBeInTheDocument();
    expect(within(dataPanel).getByText('Case reference')).toBeInTheDocument();
    expect(within(dataPanel).getByText('Document notes')).toBeInTheDocument();
    expect(within(dataPanel).getByText('Review notes')).toBeInTheDocument();
    expect(within(dataPanel).getByText('Approval reference')).toBeInTheDocument();
    expect(within(dataPanel).getByText('CASE-1')).toBeInTheDocument();
    expect(within(dataPanel).getByText('Documents complete')).toBeInTheDocument();
    expect(within(dataPanel).getByText('APP-1')).toBeInTheDocument();
    expect(
      within(dataPanel)
        .getByText('Intake completed')
        .compareDocumentPosition(within(dataPanel).getByText('Approval completed')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(await screen.findByText('Moved to Approval completed')).toBeInTheDocument();
    expect(screen.queryByText('STATUS_CHANGED')).not.toBeInTheDocument();
  });

  it('renders Procurement array data as a semantic list and multiline text without raw JSON', async () => {
    listedTasks = [procurementTask];
    renderApp();

    const dataPanel = await screen.findByRole('group', { name: 'Current task data groups' });
    expect(
      within(dataPanel).getByRole('heading', { name: 'Supplier offers received' }),
    ).toBeInTheDocument();
    expect(within(dataPanel).getByText('Quotes')).toBeInTheDocument();
    const quoteItems = within(dataPanel).getAllByRole('listitem');
    expect(quoteItems.map((item) => item.textContent)).toEqual(['QUOTE-1', 'QUOTE-2']);
    const receiptValue = within(dataPanel).getByText((_, element) => {
      return element?.tagName === 'DD' && element.textContent === 'Receipt line 1\nReceipt line 2';
    });
    expect(receiptValue).toBeInTheDocument();
    expect(within(dataPanel).queryByText(/\["QUOTE-1","QUOTE-2"\]/)).not.toBeInTheDocument();
  });

  it('shows empty messages for data-bearing statuses without effective values', async () => {
    listedTasks = [
      {
        ...complianceReviewTask,
        effectiveData: { 2: { caseReference: 'CASE-1' } },
      },
    ];
    renderApp();

    const dataPanel = await screen.findByRole('group', { name: 'Current task data groups' });
    expect(within(dataPanel).getByText('Case reference')).toBeInTheDocument();
    expect(within(dataPanel).getAllByText('No data captured for this status.')).toHaveLength(2);
  });

  it('does not render retained higher-status data after backward movement', async () => {
    listedTasks = [
      {
        ...complianceIntakeTask,
        effectiveData: {
          2: { caseReference: 'CASE-1' },
          3: { documentNotes: 'Retained document notes' },
          4: { reviewNotes: 'Retained review notes' },
        },
      },
    ];
    renderApp();

    const dataPanel = await screen.findByRole('group', { name: 'Current task data groups' });
    expect(within(dataPanel).getByText('Case reference')).toBeInTheDocument();
    expect(within(dataPanel).queryByText('Retained document notes')).not.toBeInTheDocument();
    expect(within(dataPanel).queryByText('Retained review notes')).not.toBeInTheDocument();
  });

  it('shows a read-only closed detail without mutation controls', async () => {
    listedTasks = [closedTask];
    renderApp();

    expect(await screen.findByText('Read-only.')).toBeInTheDocument();
    expect(screen.getByText('This task is closed and cannot be changed.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current task data' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Current task data groups' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Available actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close task/i })).not.toBeInTheDocument();
  });

  it('opens a labeled New Task modal with explicit initial assignee', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /new task/i }));

    expect(await screen.findByRole('dialog', { name: 'New Task' })).toBeInTheDocument();
    const taskTypeSelect = screen.getByLabelText('Task type');
    expect(taskTypeSelect).toBeInTheDocument();
    expect(within(taskTypeSelect).getByRole('option', { name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Initial assignee')).toBeInTheDocument();
  });

  it('renders the Compliance status 2 TEXT field from available actions', async () => {
    listedTasks = [complianceCreatedTask];
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /continue to intake completed/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Intake completed' });
    const caseReference = within(dialog).getByLabelText('Case reference');
    fireEvent.change(caseReference, { target: { value: 'CASE-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(transitionBodies).toEqual([
        expect.objectContaining({
          targetStatus: 2,
          data: { caseReference: 'CASE-2' },
        }),
      ]);
    });
  });

  it('renders the Compliance status 3 TEXT field from available actions', async () => {
    listedTasks = [complianceIntakeTask];
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /continue to documents verified/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Documents verified' });
    const documentNotes = within(dialog).getByLabelText('Document notes');
    fireEvent.change(documentNotes, {
      target: { value: 'Documents reviewed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(transitionBodies).toEqual([
        expect.objectContaining({
          targetStatus: 3,
          data: { documentNotes: 'Documents reviewed' },
        }),
      ]);
    });
  });

  it('prefills Compliance status re-entry from currentValues', async () => {
    listedTasks = [complianceDocumentsRevisitTask];
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /continue to documents verified/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Documents verified' });

    expect(within(dialog).getByLabelText('Document notes')).toHaveValue('Documents complete');
  });

  it('renders Compliance statuses 4 and 5 as generic TEXT fields', async () => {
    listedTasks = [complianceDocumentsTask];
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: /continue to compliance review completed/i }),
    );
    expect(
      within(
        await screen.findByRole('dialog', { name: 'Compliance review completed' }),
      ).getByLabelText('Review notes'),
    ).toBeInTheDocument();

    cleanup();
    transitionBodies = [];
    listedTasks = [complianceReviewTask];
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /continue to approval completed/i }));
    expect(
      within(await screen.findByRole('dialog', { name: 'Approval completed' })).getByLabelText(
        'Approval reference',
      ),
    ).toBeInTheDocument();
  });

  it('requires an explicit Development distribution version on first visit', async () => {
    listedTasks = [developmentReadyTask];
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: /continue to distribution completed/i }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Distribution completed' });
    const versionInput = within(dialog).getByLabelText('Version');
    expect(versionInput).toHaveValue('');
    expect(versionInput).not.toHaveValue('1.2.3');
    if (versionInput.getAttribute('placeholder') === '1.2.3') {
      expect(versionInput).toHaveValue('');
    }

    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(await within(dialog).findByText('Version is required')).toBeInTheDocument();
    expect(transitionBodies).toHaveLength(0);

    fireEvent.change(versionInput, { target: { value: '2.4.0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(transitionBodies).toEqual([
        expect.objectContaining({
          targetStatus: 4,
          data: { version: '2.4.0' },
        }),
      ]);
    });
  });

  it('prefills a Development distribution version only from currentValues on revisit', async () => {
    listedTasks = [developmentRevisitTask];
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: /continue to distribution completed/i }),
    );

    expect(
      within(await screen.findByRole('dialog', { name: 'Distribution completed' })).getByLabelText(
        'Version',
      ),
    ).toHaveValue('2.4.0');
  });
});
