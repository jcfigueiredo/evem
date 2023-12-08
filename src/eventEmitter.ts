import { v4 as uuidv4 } from 'uuid';
type EventCallback<T = unknown> = (args: T) => void | Promise<void>;

interface IEventEmitter {
    subscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
    unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void;
    publish<T = unknown>(event: string, args?: T): Promise<void>;
}

class EvEm implements IEventEmitter {
    private events = new Map<string, Map<string, EventCallback>>();

    private recursionDepth = new Map<string, number>();
    private maxRecursionDepth: number;

    constructor(maxRecursionDepth: number = 3) {
        this.maxRecursionDepth = maxRecursionDepth;
    }

    private incrementRecursionDepth(event: string): void {
        const depth = (this.recursionDepth.get(event) || 0) + 1;
        if (depth > this.maxRecursionDepth) {
            throw new Error(`Max recursion depth of ${this.maxRecursionDepth} exceeded for event '${event}'`);
        }
        this.recursionDepth.set(event, depth);
    }

    private resetRecursionDepth(event: string): void {
        this.recursionDepth.set(event, 0);
    }

    subscribe<T = unknown>(event: string, callback: EventCallback<T>): string {
        if (!event) throw new Error("Event name cannot be empty.");
        
        const callbacks = this.events.get(event) ?? new Map();
        const id = uuidv4(); // Generate a UUID for the subscription
        callbacks.set(id, callback as EventCallback);
        this.events.set(event, callbacks);

        return id;
    }

    unsubscribe<T = unknown>(event: string, callback: EventCallback<T>): void {
        if (!event) throw new Error("You can't subscribe to an event with an empty name.");

        const callbacks = this.events.get(event);
        if (!callbacks) return;

        for (const [id, cb] of callbacks) {
            if (cb === callback) {
                callbacks.delete(id);
                break;
            }
        }
    }

    unsubscribeById(id: string, event?: string): void {
        if (event) {
            // Unsubscribe from a specific event
            const callbacks = this.events.get(event);
            if (callbacks) {
                callbacks.delete(id);
            }
        } else {
            // Unsubscribe from all events if event name is not provided
            for (const [eventName, callbacks] of this.events) {
                if (callbacks.has(id)) {
                    callbacks.delete(id);
                    break; // Assuming UUIDs are unique across all events
                }
            }
        }
    }    

    async publish<T = unknown>(event: string, args?: T): Promise<void> {
        if (!event) {
            return Promise.reject(new Error("Event name cannot be empty."));
        }

        this.incrementRecursionDepth(event);

        const eventParts = event.split('.');
        const asyncCallbacks: Promise<void>[] = [];

        this.events.forEach((callbacks, key) => {
            const keyParts = key.split('.');
            if (keyParts.length !== eventParts.length) return;

            let match = true;
            for (let i = 0; i < keyParts.length; i++) {
                if (keyParts[i] !== '*' && keyParts[i] !== eventParts[i]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                callbacks.forEach(callback => {
                    const result = (callback as EventCallback<T>)(args ?? {} as T);
                    if (result instanceof Promise) {
                        asyncCallbacks.push(result);
                    }
                });
            }
        });

        await Promise.all(asyncCallbacks);
        this.resetRecursionDepth(event);
    }
}


export { EvEm, type IEventEmitter, type EventCallback };