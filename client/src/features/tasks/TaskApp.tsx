import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { api, newIdempotencyKey } from './api.js';
import type {
  ApiError,
  AvailableTransition,
  FieldDefinition,
  Task,
  TaskEvent,
  TaskTypeDefinition,
  User,
} from './types.js';

type FormValues = Record<string, unknown>;
type StateFilter = 'ALL' | 'OPEN' | 'CLOSED';
type AssigneeFilter = 'ALL' | string;
type MutationError = ApiError | Error | null;

const pageSize = 20;

export function TaskApp(): JSX.Element {
  const queryClient = useQueryClient();
  const newTaskButtonRef = useRef<HTMLButtonElement | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTransition, setActiveTransition] = useState<AvailableTransition | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailError, setDetailError] = useState<MutationError>(null);
  const [liveMessage, setLiveMessage] = useState('');

  const users = useQuery({ queryKey: ['users'], queryFn: api.users });
  const types = useQuery({ queryKey: ['task-types'], queryFn: api.taskTypes });
  const assignedUserId = assigneeFilter === 'ALL' ? undefined : assigneeFilter;
  const tasks = useInfiniteQuery({
    queryKey: [
      'tasks',
      { assignedUserId: assignedUserId ?? null, state: stateFilter, limit: pageSize },
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.tasks({ assignedUserId, state: stateFilter, limit: pageSize, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const taskItems = useMemo(
    () => tasks.data?.pages.flatMap((page) => page.items) ?? [],
    [tasks.data],
  );
  const totalCount = tasks.data?.pages[0]?.totalCount ?? 0;
  const selectedTaskType = selectedTask
    ? types.data?.items.find((taskType) => taskType.key === selectedTask.type)
    : undefined;

  useEffect(() => {
    if (tasks.isLoading || tasks.isFetchingNextPage) return;
    const retained = selectedTask ? taskItems.find((task) => task.id === selectedTask.id) : null;
    if (retained && retained !== selectedTask) {
      setSelectedTask(retained);
      return;
    }
    if (!retained) setSelectedTask(taskItems[0] ?? null);
  }, [selectedTask, taskItems, tasks.isLoading, tasks.isFetchingNextPage]);

  const create = useMutation({
    mutationFn: (command: { values: { type: string; assignedUserId: string }; key: string }) =>
      api.createTask(command.values, command.key),
    onSuccess: async (task) => {
      setStateFilter('OPEN');
      if (assigneeFilter !== 'ALL' && assigneeFilter !== task.assignedUser.id) {
        setAssigneeFilter(task.assignedUser.id);
      }
      setSelectedTask(task);
      setIsCreateOpen(false);
      setLiveMessage('Task created.');
      newTaskButtonRef.current?.focus();
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const close = useMutation({
    mutationFn: (command: { task: Task; key: string }) =>
      api.closeTask(command.task.id, command.task.version, command.key),
    onSuccess: async (task) => {
      setSelectedTask(task);
      setDetailError(null);
      setLiveMessage('Task closed.');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['events', task.id] });
    },
    onError: (error) => setDetailError(error as MutationError),
  });

  const resetFilters = () => {
    setAssigneeFilter('ALL');
    setStateFilter('ALL');
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    create.reset();
    newTaskButtonRef.current?.focus();
  };

  const reloadSelectedTask = async () => {
    if (!selectedTask) return;
    const task = await api.task(selectedTask.id);
    setSelectedTask(task);
    setDetailError(null);
    setLiveMessage('Task reloaded.');
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['events', selectedTask.id] });
  };

  return (
    <main className="app">
      <header className="appHeader">
        <h1>Task Platform</h1>
        <button
          type="button"
          ref={newTaskButtonRef}
          className="primaryButton"
          onClick={() => {
            create.reset();
            setIsCreateOpen(true);
          }}
        >
          <Plus size={16} /> New Task
        </button>
      </header>

      <div className="shell">
        <aside className="sidebar" aria-label="Task browser">
          <div className="browserHeader">
            <h2>Task browser</h2>
            <span>{formatTaskCount(totalCount)}</span>
          </div>

          <TaskFilters
            users={users.data?.items ?? []}
            assigneeFilter={assigneeFilter}
            stateFilter={stateFilter}
            onAssigneeChange={setAssigneeFilter}
            onStateChange={setStateFilter}
          />

          <TaskList
            tasks={taskItems}
            selectedTaskId={selectedTask?.id ?? null}
            isLoading={tasks.isLoading}
            isError={tasks.isError}
            onSelect={(task) => {
              setSelectedTask(task);
              setDetailError(null);
            }}
            onClearFilters={resetFilters}
          />

          {tasks.hasNextPage ? (
            <button
              type="button"
              onClick={() => void tasks.fetchNextPage()}
              disabled={tasks.isFetchingNextPage}
            >
              {tasks.isFetchingNextPage ? <Loader2 size={16} /> : null}
              Load more
            </button>
          ) : null}
        </aside>

        <section className="detail" aria-label="Task detail">
          {selectedTask ? (
            <>
              <TaskDetailHeader task={selectedTask} />
              {selectedTask.state === 'CLOSED' ? (
                <div className="notice" role="status">
                  <strong>Read-only.</strong> This task is closed and cannot be changed.
                </div>
              ) : null}
              {detailError ? (
                <ErrorNotice error={detailError} onReload={() => void reloadSelectedTask()} />
              ) : null}
              {selectedTask.state === 'OPEN' ? (
                <TaskActions
                  task={selectedTask}
                  isClosing={close.isPending}
                  onTransition={setActiveTransition}
                  onClose={(task) => close.mutate({ task, key: newIdempotencyKey() })}
                />
              ) : null}
              <TaskData task={selectedTask} taskType={selectedTaskType} />
              <TaskActivity
                task={selectedTask}
                taskType={selectedTaskType}
                users={users.data?.items ?? []}
              />
              {activeTransition ? (
                <TransitionDialog
                  task={selectedTask}
                  action={activeTransition}
                  users={users.data?.items ?? []}
                  onCancel={() => setActiveTransition(null)}
                  onSaved={(task) => {
                    setSelectedTask(task);
                    setActiveTransition(null);
                    setDetailError(null);
                    setLiveMessage('Task updated.');
                    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
                    void queryClient.invalidateQueries({ queryKey: ['events', task.id] });
                  }}
                  onConflict={(error) => setDetailError(error)}
                />
              ) : null}
            </>
          ) : (
            <div className="empty">
              <h2>No task selected</h2>
              <p>Choose a task from the filtered list, or clear filters to broaden the result.</p>
            </div>
          )}
        </section>
      </div>

      {isCreateOpen ? (
        <CreateTaskDialog
          users={users.data?.items ?? []}
          types={types.data?.items ?? []}
          defaultAssigneeId={assignedUserId}
          isPending={create.isPending}
          error={create.error as MutationError}
          onCancel={closeCreateModal}
          onSubmit={(values, key) => create.mutate({ values, key })}
        />
      ) : null}

      <div className="srOnly" aria-live="polite">
        {liveMessage}
      </div>
    </main>
  );
}

function TaskFilters({
  users,
  assigneeFilter,
  stateFilter,
  onAssigneeChange,
  onStateChange,
}: {
  users: User[];
  assigneeFilter: AssigneeFilter;
  stateFilter: StateFilter;
  onAssigneeChange(value: AssigneeFilter): void;
  onStateChange(value: StateFilter): void;
}): JSX.Element {
  return (
    <section className="panel" aria-labelledby="task-filters-heading">
      <h3 id="task-filters-heading">Task filters</h3>
      <label>
        Assignee
        <select value={assigneeFilter} onChange={(event) => onAssigneeChange(event.target.value)}>
          <option value="ALL">All users</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="segmented" aria-label="State">
        <legend>State</legend>
        {(['ALL', 'OPEN', 'CLOSED'] as const).map((state) => (
          <label
            key={state}
            className={stateFilter === state ? 'segment selected' : 'segment'}
            aria-pressed={stateFilter === state}
          >
            <input
              type="radio"
              name="stateFilter"
              value={state}
              checked={stateFilter === state}
              onChange={() => onStateChange(state)}
            />
            {toTitle(state)}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

function TaskList({
  tasks,
  selectedTaskId,
  isLoading,
  isError,
  onSelect,
  onClearFilters,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  isLoading: boolean;
  isError: boolean;
  onSelect(task: Task): void;
  onClearFilters(): void;
}): JSX.Element {
  if (isLoading) return <div className="emptyList">Loading tasks...</div>;
  if (isError) {
    return (
      <div className="emptyList errorBox">
        <strong>Unable to load tasks.</strong>
        <span>Retry from the browser controls or clear filters.</span>
        <button type="button" onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="emptyList">
        <strong>No tasks match these filters.</strong>
        <span>Try a different assignee or state.</span>
        <button type="button" onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="list">
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          selected={selectedTaskId === task.id}
          onSelect={() => onSelect(task)}
        />
      ))}
    </div>
  );
}

function TaskListItem({
  task,
  selected,
  onSelect,
}: {
  task: Task;
  selected: boolean;
  onSelect(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`taskRow state-${task.state.toLowerCase()}${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="taskTopLine">
        <span className="taskNameGroup">
          <TaskIdTag id={task.id} />
          <strong>{task.typeLabel}</strong>
        </span>
        <StateBadge state={task.state} />
      </span>
      <span>{task.currentStatusLabel}</span>
      <small>
        {task.assignedUser.displayName} · v{task.version}
      </small>
    </button>
  );
}

function TaskDetailHeader({ task }: { task: Task }): JSX.Element {
  return (
    <header className="detailHeader">
      <div>
        <div className="titleRow">
          <span className="taskNameGroup">
            <TaskIdTag id={task.id} />
            <h2>{task.typeLabel}</h2>
          </span>
          <StateBadge state={task.state} />
        </div>
        <p>{task.currentStatusLabel}</p>
        <dl className="metadata">
          <div>
            <dt>Assignee:</dt>
            <dd>{task.assignedUser.displayName}</dd>
          </div>
          <div>
            <dt>Version:</dt>
            <dd>{task.version}</dd>
          </div>
          {task.closedAt ? (
            <div>
              <dt>Closed:</dt>
              <dd>{formatDate(task.closedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  );
}

function TaskActions({
  task,
  isClosing,
  onTransition,
  onClose,
}: {
  task: Task;
  isClosing: boolean;
  onTransition(action: AvailableTransition): void;
  onClose(task: Task): void;
}): JSX.Element {
  const hasActions = task.availableActions.transitions.length > 0 || task.availableActions.close;
  return (
    <section className="sectionBlock" aria-labelledby="available-actions-heading">
      <h3 id="available-actions-heading">Available actions</h3>
      {hasActions ? (
        <div className="actions">
          {task.availableActions.transitions.map((action) => (
            <button type="button" key={action.targetStatus} onClick={() => onTransition(action)}>
              {action.direction === 'FORWARD' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {action.direction === 'FORWARD'
                ? `Continue to ${action.targetLabel}`
                : `Move back to ${action.targetLabel}`}
            </button>
          ))}
          {task.availableActions.close ? (
            <button type="button" onClick={() => onClose(task)} disabled={isClosing}>
              {isClosing ? <Loader2 size={16} /> : <Check size={16} />}
              Close task
            </button>
          ) : null}
        </div>
      ) : (
        <p className="muted">No actions are currently available.</p>
      )}
    </section>
  );
}

function CreateTaskDialog({
  users,
  types,
  defaultAssigneeId,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  users: User[];
  types: TaskTypeDefinition[];
  defaultAssigneeId: string | undefined;
  isPending: boolean;
  error: MutationError;
  onCancel(): void;
  onSubmit(values: { type: string; assignedUserId: string }, key: string): void;
}): JSX.Element {
  const form = useForm<{ type: string; assignedUserId: string }>({
    defaultValues: {
      type: types[0]?.key ?? '',
      assignedUserId: defaultAssigneeId ?? '',
    },
  });
  const submission = useLogicalSubmissionKey();

  return (
    <ManagedDialog labelledBy="new-task-heading" onCancel={onCancel}>
      <form
        className="dialogForm"
        onSubmit={form.handleSubmit((values) => {
          onSubmit(values, submission.keyFor(values));
        })}
      >
        <header>
          <h2 id="new-task-heading">New Task</h2>
          <button type="button" title="Cancel" onClick={onCancel} disabled={isPending}>
            <X size={16} />
          </button>
        </header>
        <label>
          Task type
          <select {...form.register('type', { required: 'Task type is required' })}>
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Initial assignee
          <select
            {...form.register('assignedUserId', { required: 'Initial assignee is required' })}
          >
            <option value="" disabled>
              Select a user
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        <FormError message={form.formState.errors.type?.message} />
        <FormError message={form.formState.errors.assignedUserId?.message} />
        <ApiErrorText error={error} />
        <footer>
          <button type="button" onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className="primaryButton" disabled={isPending}>
            {isPending ? <Loader2 size={16} /> : <Plus size={16} />}
            Create
          </button>
        </footer>
      </form>
    </ManagedDialog>
  );
}

function TransitionDialog({
  task,
  action,
  users,
  onCancel,
  onSaved,
  onConflict,
}: {
  task: Task;
  action: AvailableTransition;
  users: User[];
  onCancel(): void;
  onSaved(task: Task): void;
  onConflict(error: MutationError): void;
}): JSX.Element {
  const form = useForm<FormValues>({
    defaultValues: { nextAssignedUserId: task.assignedUser.id, ...action.currentValues },
  });
  const submission = useLogicalSubmissionKey();
  const mutation = useMutation({
    mutationFn: (command: { values: Record<string, unknown>; key: string }) =>
      api.transitionTask(
        task.id,
        {
          targetStatus: action.targetStatus,
          nextAssignedUserId: String(command.values.nextAssignedUserId),
          expectedVersion: action.expectedVersion,
          data: buildPayload(action.requiredFields, command.values),
        },
        command.key,
      ),
    onSuccess: onSaved,
    onError: (error) => {
      const apiError = error as ApiError;
      if (apiError.code === 'VERSION_CONFLICT') {
        onConflict(apiError);
        onCancel();
      }
    },
  });

  return (
    <ManagedDialog labelledBy="transition-heading" onCancel={onCancel}>
      <form
        className="dialogForm"
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate({ values, key: submission.keyFor(values) });
        })}
      >
        <header>
          <h2 id="transition-heading">{action.targetLabel}</h2>
          <button type="button" title="Cancel" onClick={onCancel} disabled={mutation.isPending}>
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {task.currentStatusLabel} to {action.targetLabel}
        </p>
        <label>
          Next assignee
          <select
            {...form.register('nextAssignedUserId', {
              required: 'Next assignee is required',
            })}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        {action.requiredFields.map((field) => (
          <DynamicField key={field.name} field={field} register={form.register} />
        ))}
        {action.requiredFields.map((field) => (
          <FormError
            key={`${field.name}-error`}
            message={fieldErrorMessage(form.formState.errors, field)}
          />
        ))}
        <FormError message={form.formState.errors.nextAssignedUserId?.message as string} />
        <ApiErrorText error={mutation.error as MutationError} />
        <footer>
          <button type="button" onClick={onCancel} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="submit" className="primaryButton" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 size={16} /> : <Check size={16} />}
            Save
          </button>
        </footer>
      </form>
    </ManagedDialog>
  );
}

function ManagedDialog({
  labelledBy,
  onCancel,
  children,
}: {
  labelledBy: string;
  onCancel(): void;
  children: ReactNode;
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>(
      'select:not([disabled]), input:not([disabled]), button:not([disabled])',
    );
    firstField?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled])',
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal" role="presentation">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}

function DynamicField({
  field,
  register,
}: {
  field: FieldDefinition;
  register: UseFormRegister<FormValues>;
}): JSX.Element {
  switch (field.kind) {
    case 'TEXT':
      return (
        <label>
          {field.label}
          <input
            {...register(field.name, { required: `${field.label} is required` })}
            autoComplete="off"
            minLength={field.minLength}
          />
        </label>
      );
    case 'FIXED_STRING_ARRAY':
      return (
        <fieldset>
          <legend>{field.label}</legend>
          {Array.from({ length: field.exactItems }, (_, index) => (
            <input
              key={index}
              aria-label={`${field.label} ${index + 1}`}
              {...register(`${field.name}.${index}`, {
                required: `${field.label} ${index + 1} is required`,
              })}
              minLength={field.itemMinLength}
            />
          ))}
        </fieldset>
      );
    default:
      return <p className="muted">Unsupported field.</p>;
  }
}

function TaskData({
  task,
  taskType,
}: {
  task: Task;
  taskType: TaskTypeDefinition | undefined;
}): JSX.Element {
  const renderedStatuses =
    taskType?.statuses
      .filter((status) => status.status <= task.currentStatus && status.fields.length > 0)
      .map((status) => {
        const data = task.effectiveData[String(status.status)];
        return (
          <section className="dataGroup" key={status.status}>
            <h4>{status.label}</h4>
            {!data || Object.keys(data).length === 0 ? (
              <p className="muted">No data captured for this status.</p>
            ) : (
              <FieldValueList className="dataFieldList" fields={status.fields} values={data} />
            )}
          </section>
        );
      })
      .filter(Boolean) ?? [];

  return (
    <section className="sectionBlock" aria-labelledby="task-data-heading">
      <h3 id="task-data-heading">Current task data</h3>
      {renderedStatuses.length > 0 ? (
        <div className="dataPanel" role="group" aria-label="Current task data groups">
          {renderedStatuses}
        </div>
      ) : (
        <p className="muted">No business data has been captured yet.</p>
      )}
    </section>
  );
}

function FieldValueList({
  className = 'fieldList',
  fields,
  values,
}: {
  className?: string;
  fields: readonly FieldDefinition[];
  values: Record<string, unknown>;
}): JSX.Element {
  return (
    <dl className={className}>
      {fields.map((field) => (
        <div key={field.name}>
          <dt>{field.label}</dt>
          <dd>{renderFieldValue(field, values[field.name])}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderFieldValue(field: FieldDefinition, value: unknown): ReactNode {
  switch (field.kind) {
    case 'TEXT':
      return typeof value === 'string' && value.length > 0 ? value : 'No value captured';
    case 'FIXED_STRING_ARRAY':
      return Array.isArray(value) && value.length > 0 ? (
        <ul>
          {value.map((item, index) => (
            <li key={`${field.name}-${index}`}>{String(item)}</li>
          ))}
        </ul>
      ) : (
        'No values captured'
      );
    default:
      return 'Unsupported field';
  }
}

function TaskActivity({
  task,
  taskType,
  users,
}: {
  task: Task;
  taskType: TaskTypeDefinition | undefined;
  users: User[];
}): JSX.Element {
  const events = useQuery({
    queryKey: ['events', task.id],
    queryFn: () => api.taskEvents(task.id),
  });

  return (
    <section className="sectionBlock history" aria-labelledby="task-activity-heading">
      <h3 id="task-activity-heading">Activity</h3>
      {events.isLoading ? <p className="muted">Loading activity...</p> : null}
      {events.isError ? (
        <p className="error" role="alert">
          Unable to load activity.
        </p>
      ) : null}
      {events.data?.items.map((event) => (
        <ActivityItem key={event.id} event={event} taskType={taskType} users={users} />
      ))}
    </section>
  );
}

function ActivityItem({
  event,
  taskType,
  users,
}: {
  event: TaskEvent;
  taskType: TaskTypeDefinition | undefined;
  users: User[];
}): JSX.Element {
  const status = taskType?.statuses.find((item) => item.status === event.toStatus);
  const fields = status?.fields ?? [];
  const userName =
    users.find((user) => user.id === event.toAssignedUserId)?.displayName ?? 'Unknown user';
  return (
    <article className="event">
      <div>
        <strong>{eventDescription(event, status?.label ?? `status ${event.toStatus}`)}</strong>
        <small>
          {formatDate(event.occurredAt)} · v{event.taskVersion} · Assigned to {userName}
        </small>
      </div>
      {event.eventType === 'STATUS_CHANGED' && fields.length > 0 ? (
        <FieldValueList fields={fields} values={event.payload} />
      ) : null}
    </article>
  );
}

function eventDescription(event: TaskEvent, targetLabel: string): string {
  if (event.eventType === 'TASK_CREATED') return 'Task created';
  if (event.eventType === 'TASK_CLOSED') return 'Task closed';
  if (event.fromStatus !== null && event.toStatus < event.fromStatus) {
    return `Moved back to ${targetLabel}`;
  }
  return `Moved to ${targetLabel}`;
}

function StateBadge({ state }: { state: Task['state'] }): JSX.Element {
  return <span className={`badge badge-${state.toLowerCase()}`}>{state}</span>;
}

function TaskIdTag({ id }: { id: string }): JSX.Element {
  return (
    <span className="taskId" title={`Task ID ${id}`} aria-label={`Task ID ${id}`}>
      {formatTaskDisplayId(id)}
    </span>
  );
}

function ErrorNotice({
  error,
  onReload,
}: {
  error: MutationError;
  onReload(): void;
}): JSX.Element | null {
  if (!error) return null;
  const apiError = error as ApiError;
  const isConflict = apiError.code === 'VERSION_CONFLICT';
  return (
    <div className="errorBox" role="alert">
      <AlertTriangle size={16} />
      <div>
        <strong>{isConflict ? 'This task changed.' : 'Action failed.'}</strong>
        <p>{isConflict ? 'Reload the latest task before trying another action.' : error.message}</p>
      </div>
      <button type="button" onClick={onReload}>
        <RotateCw size={16} />
        Reload
      </button>
    </div>
  );
}

function ApiErrorText({ error }: { error: MutationError }): JSX.Element | null {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error.message}
    </p>
  );
}

function FormError({ message }: { message: string | undefined }): JSX.Element | null {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function fieldErrorMessage(errors: unknown, field: FieldDefinition): string | undefined {
  const entry = (errors as Record<string, unknown>)[field.name];
  if (entry && typeof entry === 'object' && 'message' in entry) {
    const message = (entry as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  if (Array.isArray(entry)) {
    const nested = entry.find((item) => item && typeof item === 'object' && 'message' in item) as
      { message?: unknown } | undefined;
    return typeof nested?.message === 'string' ? nested.message : undefined;
  }
  return undefined;
}

function useLogicalSubmissionKey(): { keyFor(value: unknown): string } {
  const lastSubmission = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    keyFor(value: unknown) {
      const fingerprint = JSON.stringify(value);
      if (lastSubmission.current?.fingerprint === fingerprint) {
        return lastSubmission.current.key;
      }
      const key = newIdempotencyKey();
      lastSubmission.current = { fingerprint, key };
      return key;
    },
  };
}

function buildPayload(
  fields: readonly FieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.kind === 'TEXT') return [field.name, values[field.name]];
      const arrayValue = values[field.name];
      return [
        field.name,
        Array.from({ length: field.exactItems }, (_, index) =>
          Array.isArray(arrayValue) ? arrayValue[index] : undefined,
        ),
      ];
    }),
  );
}

function formatTaskCount(count: number): string {
  return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

function formatTaskDisplayId(id: string): string {
  const uuidMatch = id.match(
    /^([0-9a-f]{8})-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return `#${uuidMatch?.[1] ?? id}`;
}

function toTitle(value: StateFilter): string {
  return value[0] + value.slice(1).toLowerCase();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
