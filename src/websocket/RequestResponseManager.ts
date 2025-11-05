import { v4 as uuidv4 } from 'uuid';
import type { EvEm } from '../eventEmitter';
import type {
  RequestMessage,
  ResponseMessage,
  PendingRequest,
  RequestOptions,
} from './types';
import { RequestTimeoutError } from './types';

/**
 * Manages request-response pattern for WebSocket communication
 * Uses correlation IDs to match responses to requests
 */
export class RequestResponseManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private responseSubscriptionId?: string;
  private errorSubscriptionId?: string;

  constructor(private evem: EvEm) {
    this.setupResponseHandlers();
  }

  /**
   * Setup handlers for response events
   */
  private setupResponseHandlers(): void {
    // Handle successful responses
    this.responseSubscriptionId = this.evem.subscribe(
      'ws.response',
      (response: ResponseMessage) => {
        this.handleResponse(response, false);
      }
    );

    // Handle error responses
    this.errorSubscriptionId = this.evem.subscribe(
      'ws.response.error',
      (response: ResponseMessage) => {
        this.handleResponse(response, true);
      }
    );
  }

  /**
   * Send a request and wait for response
   */
  async request(
    method: string,
    params?: any,
    options: RequestOptions = {}
  ): Promise<any> {
    const timeout = options.timeout ?? 5000;
    const id = options.id ?? uuidv4();

    // Create the request message
    const requestMessage: RequestMessage = {
      id,
      method,
      params,
      timestamp: Date.now(),
    };

    // Create promise that will be resolved/rejected when response arrives
    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeoutId = setTimeout(() => {
        // Remove from pending requests
        this.pendingRequests.delete(id);

        // Reject with timeout error
        reject(new RequestTimeoutError(id, method, timeout));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
        timestamp: Date.now(),
      });

      // Publish the request
      this.evem.publish('ws.send.request', requestMessage);
    });
  }

  /**
   * Handle incoming response
   */
  private handleResponse(response: ResponseMessage, isError: boolean): void {
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      // Response for unknown or already-handled request - ignore
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutId as NodeJS.Timeout);

    // Remove from pending requests
    this.pendingRequests.delete(response.id);

    if (isError) {
      // Error response
      const error = response.error!;
      const err: any = new Error(error.message);
      err.code = error.code;
      err.data = error.data;
      pending.reject(err);
    } else {
      // Success response
      pending.resolve(response.result);
    }
  }

  /**
   * Get the number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Clean up subscriptions
   */
  cleanup(): void {
    if (this.responseSubscriptionId) {
      this.evem.unsubscribe(this.responseSubscriptionId);
      this.responseSubscriptionId = undefined;
    }

    if (this.errorSubscriptionId) {
      this.evem.unsubscribe(this.errorSubscriptionId);
      this.errorSubscriptionId = undefined;
    }

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId as NodeJS.Timeout);
      pending.reject(new Error('RequestResponseManager cleanup'));
    }
    this.pendingRequests.clear();
  }
}
