import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvEm } from '../../src/eventEmitter';
import { ConnectionManager } from '../../src/websocket/ConnectionManager';
import type { ConnectionState, ConnectionStateChangeEvent } from '../../src/websocket/types';

describe('ConnectionManager', () => {
  let evem: EvEm;
  let connectionManager: ConnectionManager;
  let stateChanges: ConnectionStateChangeEvent[];

  beforeEach(() => {
    evem = new EvEm();
    connectionManager = new ConnectionManager(evem);
    stateChanges = [];

    // Track state changes
    evem.subscribe('ws.connection.state', (event: ConnectionStateChangeEvent) => {
      stateChanges.push(event);
    });
  });

  describe('Initial State', () => {
    it('should start in disconnected state', () => {
      expect(connectionManager.getState()).toBe('disconnected');
    });

    it('should not emit event on construction', () => {
      expect(stateChanges).toHaveLength(0);
    });

    it('should return false for isConnected()', () => {
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should return false for isConnecting()', () => {
      expect(connectionManager.isConnecting()).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should transition from disconnected to connecting', async () => {
      await connectionManager.transitionTo('connecting');

      expect(connectionManager.getState()).toBe('connecting');
      expect(connectionManager.isConnecting()).toBe(true);
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should transition from connecting to connected', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');

      expect(connectionManager.getState()).toBe('connected');
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.isConnecting()).toBe(false);
    });

    it('should transition from connected to disconnecting', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnecting');

      expect(connectionManager.getState()).toBe('disconnecting');
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should transition from disconnecting to disconnected', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnecting');
      await connectionManager.transitionTo('disconnected');

      expect(connectionManager.getState()).toBe('disconnected');
    });

    it('should transition to reconnecting from disconnected', async () => {
      await connectionManager.transitionTo('reconnecting');

      expect(connectionManager.getState()).toBe('reconnecting');
      expect(connectionManager.isConnecting()).toBe(true);
    });

    it('should transition from reconnecting to connected', async () => {
      await connectionManager.transitionTo('reconnecting');
      await connectionManager.transitionTo('connected');

      expect(connectionManager.getState()).toBe('connected');
      expect(connectionManager.isConnected()).toBe(true);
    });
  });

  describe('State Change Events', () => {
    it('should emit state change event with from and to states', async () => {
      await connectionManager.transitionTo('connecting');

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toMatchObject({
        from: 'disconnected',
        to: 'connecting',
      });
      expect(stateChanges[0].timestamp).toBeGreaterThan(0);
    });

    it('should emit multiple state change events in sequence', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnecting');
      await connectionManager.transitionTo('disconnected');

      expect(stateChanges).toHaveLength(4);
      expect(stateChanges[0]).toMatchObject({ from: 'disconnected', to: 'connecting' });
      expect(stateChanges[1]).toMatchObject({ from: 'connecting', to: 'connected' });
      expect(stateChanges[2]).toMatchObject({ from: 'connected', to: 'disconnecting' });
      expect(stateChanges[3]).toMatchObject({ from: 'disconnecting', to: 'disconnected' });
    });

    it('should include timestamps in events', async () => {
      const before = Date.now();
      await connectionManager.transitionTo('connecting');
      const after = Date.now();

      expect(stateChanges[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(stateChanges[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should emit events that can be subscribed to with filters', async () => {
      const connectedEvents: ConnectionStateChangeEvent[] = [];

      evem.subscribe(
        'ws.connection.state',
        (event: ConnectionStateChangeEvent) => {
          connectedEvents.push(event);
        },
        {
          filter: (event: ConnectionStateChangeEvent) => event.to === 'connected',
        }
      );

      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnecting');

      expect(connectedEvents).toHaveLength(1);
      expect(connectedEvents[0].to).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    it('should allow transition from any state to disconnected on error', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('disconnected');

      expect(connectionManager.getState()).toBe('disconnected');
    });

    it('should allow transition from connected to disconnected on error', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnected');

      expect(connectionManager.getState()).toBe('disconnected');
      expect(stateChanges).toHaveLength(3);
    });

    it('should handle rapid state changes', async () => {
      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');
      await connectionManager.transitionTo('disconnected');
      await connectionManager.transitionTo('reconnecting');
      await connectionManager.transitionTo('connected');

      expect(connectionManager.getState()).toBe('connected');
      expect(stateChanges).toHaveLength(5);
    });
  });

  describe('State Queries', () => {
    it('should return correct isConnected() for all states', async () => {
      expect(connectionManager.isConnected()).toBe(false);

      await connectionManager.transitionTo('connecting');
      expect(connectionManager.isConnected()).toBe(false);

      await connectionManager.transitionTo('connected');
      expect(connectionManager.isConnected()).toBe(true);

      await connectionManager.transitionTo('disconnecting');
      expect(connectionManager.isConnected()).toBe(false);

      await connectionManager.transitionTo('disconnected');
      expect(connectionManager.isConnected()).toBe(false);

      await connectionManager.transitionTo('reconnecting');
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should return correct isConnecting() for all states', async () => {
      expect(connectionManager.isConnecting()).toBe(false);

      await connectionManager.transitionTo('connecting');
      expect(connectionManager.isConnecting()).toBe(true);

      await connectionManager.transitionTo('connected');
      expect(connectionManager.isConnecting()).toBe(false);

      await connectionManager.transitionTo('disconnected');
      expect(connectionManager.isConnecting()).toBe(false);

      await connectionManager.transitionTo('reconnecting');
      expect(connectionManager.isConnecting()).toBe(true);
    });

    it('should return correct isDisconnected() for all states', async () => {
      expect(connectionManager.isDisconnected()).toBe(true);

      await connectionManager.transitionTo('connecting');
      expect(connectionManager.isDisconnected()).toBe(false);

      await connectionManager.transitionTo('connected');
      expect(connectionManager.isDisconnected()).toBe(false);

      await connectionManager.transitionTo('disconnecting');
      expect(connectionManager.isDisconnected()).toBe(false);

      await connectionManager.transitionTo('disconnected');
      expect(connectionManager.isDisconnected()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle transition to same state', async () => {
      await connectionManager.transitionTo('disconnected');

      // Should still emit event even for same state
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toMatchObject({
        from: 'disconnected',
        to: 'disconnected',
      });
    });

    it('should handle multiple subscribers to state changes', async () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();
      const subscriber3 = vi.fn();

      evem.subscribe('ws.connection.state', subscriber1);
      evem.subscribe('ws.connection.state', subscriber2);
      evem.subscribe('ws.connection.state', subscriber3);

      await connectionManager.transitionTo('connecting');

      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);
      expect(subscriber3).toHaveBeenCalledTimes(1);

      expect(subscriber1).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'disconnected',
          to: 'connecting',
        })
      );
    });

    it('should maintain state consistency when event handler throws', async () => {
      evem.subscribe('ws.connection.state', () => {
        throw new Error('Handler error');
      });

      // Should not prevent state transition even if handler throws
      await expect(connectionManager.transitionTo('connecting')).resolves.not.toThrow();
      expect(connectionManager.getState()).toBe('connecting');
    });

    it('should handle async transitions', async () => {
      const transitions: ConnectionState[] = [];

      evem.subscribe('ws.connection.state', (event: ConnectionStateChangeEvent) => {
        transitions.push(event.to);
      });

      await connectionManager.transitionTo('connecting');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await connectionManager.transitionTo('connected');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transitions).toEqual(['connecting', 'connected']);
    });
  });

  describe('Integration with EvEm Features', () => {
    it('should work with priority-ordered subscribers', async () => {
      const executionOrder: string[] = [];

      evem.subscribe(
        'ws.connection.state',
        () => executionOrder.push('high'),
        { priority: 'high' }
      );
      evem.subscribe(
        'ws.connection.state',
        () => executionOrder.push('low'),
        { priority: 'low' }
      );
      evem.subscribe('ws.connection.state', () => executionOrder.push('normal'));

      await connectionManager.transitionTo('connecting');

      expect(executionOrder).toEqual(['high', 'normal', 'low']);
    });

    it('should work with once subscribers', async () => {
      const callback = vi.fn();

      evem.subscribe('ws.connection.state', callback, { once: true });

      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should work with transform functions', async () => {
      const originalEvents: ConnectionStateChangeEvent[] = [];
      const transformedEvents: string[] = [];

      // First subscriber with transform - receives original data and transforms for next
      evem.subscribe(
        'ws.connection.state',
        (event: ConnectionStateChangeEvent) => {
          originalEvents.push(event);
        },
        {
          transform: (event: ConnectionStateChangeEvent) => {
            return `${event.from} -> ${event.to}`;
          },
        }
      );

      // Second subscriber receives transformed data
      evem.subscribe('ws.connection.state', (event: string) => {
        transformedEvents.push(event);
      });

      await connectionManager.transitionTo('connecting');
      await connectionManager.transitionTo('connected');

      // First subscriber gets original data
      expect(originalEvents).toHaveLength(2);
      expect(originalEvents[0]).toMatchObject({ from: 'disconnected', to: 'connecting' });

      // Second subscriber gets transformed data
      expect(transformedEvents).toEqual([
        'disconnected -> connecting',
        'connecting -> connected',
      ]);
    });
  });
});
