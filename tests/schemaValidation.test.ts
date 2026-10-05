import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EvEm,
  ErrorPolicy,
  SchemaValidator,
  AdvancedSchemaValidator,
  SchemaValidationError
} from '../src/eventEmitter';

describe('Event Schema Validation', () => {
  let evem: EvEm;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    evem = new EvEm();
    // Save original console.error and replace it with a mock
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console.error
    console.error = originalConsoleError;
  });

  describe('Basic Schema Validation', () => {
    it('should validate event data against a simple schema', async () => {
      interface UserData {
        id: number;
        name: string;
        age: number;
      }

      // Simple schema validator that checks required fields
      const userSchema: SchemaValidator<UserData> = data => {
        return (
          typeof data === 'object' &&
          typeof data.id === 'number' &&
          typeof data.name === 'string' &&
          typeof data.age === 'number' &&
          data.age > 0
        );
      };

      const validHandler = vi.fn();
      const invalidHandler = vi.fn();

      // Subscribe with schema validation
      evem.subscribe<UserData>('user.created', validHandler, {
        schema: userSchema
      });

      // Subscribe to same event without schema validation
      evem.subscribe<any>('user.created', invalidHandler);

      // Valid data
      const validUser: UserData = { id: 1, name: 'John', age: 30 };
      await evem.publish('user.created', validUser);

      // Invalid data (missing required field)
      const invalidUser = { id: 2, name: 'Jane' }; // missing age
      await evem.publish('user.created', invalidUser);

      // Valid handler should only be called for valid data
      expect(validHandler).toHaveBeenCalledTimes(1);
      expect(validHandler).toHaveBeenCalledWith(validUser);

      // Invalid handler should be called for both (no schema validation)
      expect(invalidHandler).toHaveBeenCalledTimes(2);

      // Error should be logged for invalid data
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Schema validation failed for event'),
        expect.anything()
      );
    });

    it('should support asynchronous schema validators', async () => {
      // Async schema validator
      const asyncSchema: SchemaValidator = async data => {
        // Simulate async validation (e.g., checking database)
        await new Promise(resolve => setTimeout(resolve, 10));
        return typeof data === 'object' && data !== null && 'value' in data;
      };

      const handler = vi.fn();

      evem.subscribe('async.validated', handler, {
        schema: asyncSchema
      });

      // Valid data
      await evem.publish('async.validated', { value: 42 });

      // Invalid data
      await evem.publish('async.validated', 'not an object');

      // Handler should only be called for valid data
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });
  });

  describe('Advanced Schema Validation', () => {
    it('should provide detailed validation errors', async () => {
      interface ArticleData {
        title: string;
        content: string;
        tags: string[];
        authorId: number;
      }

      // Advanced schema validator that returns detailed error information
      const articleSchema: AdvancedSchemaValidator<ArticleData> = data => {
        const errors: SchemaValidationError[] = [];

        if (!data || typeof data !== 'object') {
          return { valid: false, errors: [{ message: 'Data must be an object' }] };
        }

        if (!data.title || typeof data.title !== 'string') {
          errors.push({
            message: 'Title is required and must be a string',
            path: 'title'
          });
        } else if (data.title.length < 3) {
          errors.push({
            message: 'Title must be at least 3 characters',
            path: 'title'
          });
        }

        if (!data.content || typeof data.content !== 'string') {
          errors.push({
            message: 'Content is required and must be a string',
            path: 'content'
          });
        }

        if (!Array.isArray(data.tags)) {
          errors.push({
            message: 'Tags must be an array',
            path: 'tags'
          });
        }

        if (typeof data.authorId !== 'number') {
          errors.push({
            message: 'AuthorId must be a number',
            path: 'authorId'
          });
        }

        return {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined
        };
      };

      const handler = vi.fn();

      evem.subscribe<ArticleData>('article.created', handler, {
        schema: articleSchema
      });

      // Valid article
      const validArticle: ArticleData = {
        title: 'Test Article',
        content: 'This is a test article',
        tags: ['test', 'validation'],
        authorId: 1
      };

      // Invalid article with multiple errors
      const invalidArticle = {
        title: 'A', // Too short
        content: 123, // Wrong type
        tags: 'test', // Not an array
        authorId: '1' // Wrong type
      };

      await evem.publish('article.created', validArticle);
      await evem.publish('article.created', invalidArticle);

      // Handler should only be called for valid data
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(validArticle);

      // Console.error should be called with detailed error information
      expect(console.error).toHaveBeenCalledTimes(1);
      // Should include multiple error messages
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Schema validation failed for event'),
        expect.arrayContaining([
          expect.objectContaining({ path: 'title' }),
          expect.objectContaining({ path: 'content' }),
          expect.objectContaining({ path: 'tags' }),
          expect.objectContaining({ path: 'authorId' })
        ])
      );
    });

    it('should support async advanced schema validators', async () => {
      // Async advanced schema validator
      const asyncAdvancedSchema: AdvancedSchemaValidator = async data => {
        // Simulate async validation
        await new Promise(resolve => setTimeout(resolve, 10));

        if (!data || typeof data !== 'object') {
          return {
            valid: false,
            errors: [{ message: 'Data must be an object' }]
          };
        }

        return { valid: true };
      };

      const handler = vi.fn();

      evem.subscribe('async.advanced', handler, {
        schema: asyncAdvancedSchema
      });

      await evem.publish('async.advanced', { valid: true });
      await evem.publish('async.advanced', 'invalid');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Policies', () => {
    it('should respect SILENT error policy for schema validation', async () => {
      const schema: SchemaValidator = data => false; // Always fails
      const handler = vi.fn();

      evem.subscribe('silent.validation', handler, {
        schema,
        schemaErrorPolicy: ErrorPolicy.SILENT
      });

      await evem.publish('silent.validation', { data: 'test' });

      // Handler should not be called due to schema validation failure
      expect(handler).not.toHaveBeenCalled();

      // No errors should be logged with SILENT policy
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should respect LOG_AND_CONTINUE error policy for schema validation', async () => {
      const schema: SchemaValidator = data => false; // Always fails
      const handler = vi.fn();

      evem.subscribe('continue.validation', handler, {
        schema,
        schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE
      });

      await evem.publish('continue.validation', { data: 'test' });

      // Handler should be called despite schema validation failure
      expect(handler).toHaveBeenCalledTimes(1);

      // Error should be logged
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should respect CANCEL_ON_ERROR error policy for schema validation (default)', async () => {
      const schema: SchemaValidator = data => false; // Always fails
      const handler = vi.fn();

      // CANCEL_ON_ERROR is the default policy
      evem.subscribe('cancel.validation', handler, {
        schema
      });

      await evem.publish('cancel.validation', { data: 'test' });

      // Handler should not be called due to schema validation failure
      expect(handler).not.toHaveBeenCalled();

      // Error should be logged
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should respect THROW error policy for schema validation', async () => {
      const handler = vi.fn();
      const laterHandler = vi.fn();

      evem.subscribe('throw.validation', handler, {
        schema: () => false,
        schemaErrorPolicy: ErrorPolicy.THROW,
        priority: 10
      });
      evem.subscribe('throw.validation', laterHandler);

      // schemaErrorPolicy THROW rejects publish on its own, whatever the publish errorPolicy
      await expect(evem.publish('throw.validation', { data: 'test' })).rejects.toThrow(
        "Schema validation failed for event 'throw.validation'"
      );

      // Handler should not be called due to schema validation failure, and propagation stops
      expect(handler).not.toHaveBeenCalled();
      expect(laterHandler).not.toHaveBeenCalled();

      // No errors should be logged with THROW policy (they're thrown instead)
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should not treat a handler error that mentions schema validation as a schema error', async () => {
      evem.subscribe('user.created', () => {
        throw new Error('Schema validation failed in my own code');
      });

      await expect(evem.publish('user.created', { id: 1 })).resolves.toBe(true);
      expect(console.error).toHaveBeenCalled();
    });

    it('should reject for an async validator under THROW policy', async () => {
      evem.subscribe('user.created', vi.fn(), {
        schema: async () => ({ valid: false, errors: [{ message: 'id must be positive' }] }),
        schemaErrorPolicy: ErrorPolicy.THROW
      });

      await expect(evem.publish('user.created', { id: -1 })).rejects.toMatchObject({
        validationErrors: [{ message: 'id must be positive' }]
      });
    });
  });

  describe('Integration with other features', () => {
    it('should work with filtering', async () => {
      // Schema validator
      const schema: SchemaValidator<any> = data => {
        return data && typeof data === 'object' && typeof data.value === 'number';
      };

      // Filter
      const filter = (data: any) => data.value > 10;

      const handler = vi.fn();

      evem.subscribe('schema.and.filter', handler, {
        schema,
        filter
      });

      // Valid schema and passes filter
      await evem.publish('schema.and.filter', { value: 20 });

      // Valid schema but fails filter
      await evem.publish('schema.and.filter', { value: 5 });

      // Invalid schema
      await evem.publish('schema.and.filter', { value: 'not a number' });

      // Handler should only be called for data that is both schema-valid and passes the filter
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ value: 20 });
    });

    it('should work with transformation and priority', async () => {
      // Schema validator
      const schema: SchemaValidator<any> = data => {
        return data && typeof data === 'object' && typeof data.id === 'number';
      };

      // Transform function
      const transform = (data: any) => {
        return { ...data, transformed: true };
      };

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // First handler with schema validation and transformation
      evem.subscribe('schema.transform', handler1, {
        schema,
        transform,
        priority: 'high'
      });

      // Second handler without schema validation
      evem.subscribe('schema.transform', handler2, {
        priority: 'normal'
      });

      // Publish valid data
      await evem.publish('schema.transform', { id: 1, name: 'Test' });

      // First handler should be called with valid data
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith({ id: 1, name: 'Test' });

      // Second handler should get transformed data
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({ id: 1, name: 'Test', transformed: true });

      // Reset mocks for next test
      vi.clearAllMocks();

      // Publish invalid data
      await evem.publish('schema.transform', { name: 'Invalid' }); // Missing id

      // First handler should not be called due to schema validation failure
      expect(handler1).not.toHaveBeenCalled();

      // Second handler should still be called (no schema validation)
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
describe('Schema validation - errors thrown by the handler itself', () => {
  let evem: EvEm;

  beforeEach(() => {
    evem = new EvEm();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should honor the publish errorPolicy for handler errors when data is valid', async () => {
    evem.subscribe(
      'user.created',
      () => {
        throw new Error('handler bug');
      },
      { schema: () => true }
    );

    await expect(evem.publish('user.created', { id: 1 }, { errorPolicy: ErrorPolicy.THROW })).rejects.toThrow(
      'handler bug'
    );
  });

  it('should call the handler only once when it throws under LOG_AND_CONTINUE schema policy', async () => {
    const handler = vi.fn(() => {
      throw new Error('handler bug');
    });
    evem.subscribe('user.created', handler, {
      schema: () => true,
      schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE
    });

    await evem.publish('user.created', { id: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should report handler errors as handler errors, not schema errors', async () => {
    const handlerError = new Error('handler bug');
    evem.subscribe(
      'user.created',
      () => {
        throw handlerError;
      },
      { schema: () => ({ valid: true }) }
    );

    await evem.publish('user.created', { id: 1 });

    expect(console.error).toHaveBeenCalledWith('Error in event handler for "user.created":', handlerError);
    expect(vi.mocked(console.error).mock.calls.some(args => String(args[0]).includes('schema validation'))).toBe(false);
  });

  it('should still apply schemaErrorPolicy when the validator itself throws', async () => {
    const handler = vi.fn();
    evem.subscribe('user.created', handler, {
      schema: () => {
        throw new Error('validator bug');
      },
      schemaErrorPolicy: ErrorPolicy.SILENT
    });

    await expect(evem.publish('user.created', { id: 1 })).resolves.toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should attach the validator errors when the THROW schema policy rejects', async () => {
    const errors = [{ message: 'name is required', path: 'name' }];
    evem.subscribe('user.created', vi.fn(), {
      schema: () => ({ valid: false, errors }),
      schemaErrorPolicy: ErrorPolicy.THROW
    });

    await expect(evem.publish('user.created', { id: 1 }, { errorPolicy: ErrorPolicy.THROW })).rejects.toMatchObject({
      validationErrors: errors
    });
  });
});

describe('Schema validation - async validators that reject', () => {
  it('should apply schemaErrorPolicy when an async validator rejects', async () => {
    const evem = new EvEm();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn();
    evem.subscribe('user.created', handler, {
      schema: async () => {
        throw new Error('validator service down');
      },
      schemaErrorPolicy: ErrorPolicy.SILENT
    });

    await expect(evem.publish('user.created', { id: 1 })).resolves.toBe(true);

    expect(handler).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should call the handler when an async validator rejects under LOG_AND_CONTINUE', async () => {
    const evem = new EvEm();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn();
    evem.subscribe('user.created', handler, {
      schema: async () => {
        throw new Error('validator service down');
      },
      schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE
    });

    await evem.publish('user.created', { id: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error during schema validation for event 'user.created'"),
      expect.anything()
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('Schema validation - what LOG_AND_CONTINUE logs', () => {
  it('logs a simple validator’s failure without errors, a thrown non-Error with none, and runs the callback anyway', async () => {
    const evem = new EvEm();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const simple = vi.fn();
    const throwing = vi.fn();
    evem.subscribe('user', simple, { schema: () => false, schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE });
    evem.subscribe('user', throwing, {
      schema: () => {
        throw 'not an Error';
      },
      schemaErrorPolicy: ErrorPolicy.LOG_AND_CONTINUE
    });

    expect(await evem.publish('user', { name: 'Ada' })).toBe(true);

    expect(simple).toHaveBeenCalledWith({ name: 'Ada' });
    expect(throwing).toHaveBeenCalledWith({ name: 'Ada' });
    expect(error.mock.calls).toEqual([
      ["Schema validation failed for event 'user'", ''],
      ["Error during schema validation for event 'user': not an Error", '']
    ]);
    error.mockRestore();
  });
});
