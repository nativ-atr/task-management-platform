import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TaskApp } from './features/tasks/TaskApp.js';
import './styles.css';

const client = new QueryClient();

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <TaskApp />
    </QueryClientProvider>
  </React.StrictMode>,
);
