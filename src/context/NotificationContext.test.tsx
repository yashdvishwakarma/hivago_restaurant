import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NotificationProvider, useNotifications } from './NotificationContext';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'rest-123', role: 'restaurant' },
  }),
}));

vi.mock('./ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../api/dashboardApi', () => ({
  fetchRestaurantSettings: vi.fn().mockResolvedValue({
    notifications: {
      emailAlerts: true,
      browserNotifications: true,
      orderSound: true,
    },
  }),
}));

vi.mock('../api/signalrService', () => ({
  signalRService: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    onNewOrder: vi.fn().mockReturnValue(() => {}),
    onOrderStatusUpdate: vi.fn().mockReturnValue(() => {}),
    onNotification: vi.fn().mockReturnValue(() => {}),
  },
}));

const TestComponent = () => {
  const { playNotification, isConnected } = useNotifications();
  return (
    <div>
      <span data-testid="connected">{isConnected ? 'Connected' : 'Disconnected'}</span>
      <button onClick={playNotification}>Play Test Sound</button>
    </div>
  );
};

describe('NotificationContext', () => {
  it('provides notification context and connects to SignalR', async () => {
    await act(async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>
      );
    });

    expect(screen.getByTestId('connected')).toHaveTextContent('Connected');
  });
});
