import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EvEm, MiddlewareConfig } from '../src';

describe('Pattern-based middleware', () => {
  let emitter: EvEm;
  
  beforeEach(() => {
    emitter = new EvEm();
  });
  
  test('middleware with pattern should only affect matching events', async () => {
    const userMiddleware = vi.fn((event, data) => {
      return { ...data, middleware: 'user' };
    });
    
    const productMiddleware = vi.fn((event, data) => {
      return { ...data, middleware: 'product' };
    });
    
    // Register middleware for user events
    emitter.use({ 
      pattern: 'user.*', 
      handler: userMiddleware 
    });
    
    // Register middleware for product events
    emitter.use({ 
      pattern: 'product.*', 
      handler: productMiddleware 
    });
    
    const userCallback = vi.fn();
    const productCallback = vi.fn();
    const orderCallback = vi.fn();
    
    emitter.subscribe('user.created', userCallback);
    emitter.subscribe('product.updated', productCallback);
    emitter.subscribe('order.completed', orderCallback);
    
    // Publish events
    await emitter.publish('user.created', { id: 1 });
    await emitter.publish('product.updated', { id: 2 });
    await emitter.publish('order.completed', { id: 3 });
    
    // Check middleware was called correctly
    expect(userMiddleware).toHaveBeenCalledTimes(1);
    expect(userMiddleware).toHaveBeenCalledWith('user.created', { id: 1 });
    
    expect(productMiddleware).toHaveBeenCalledTimes(1);
    expect(productMiddleware).toHaveBeenCalledWith('product.updated', { id: 2 });
    
    // Check data was modified correctly
    expect(userCallback).toHaveBeenCalledWith({ id: 1, middleware: 'user' });
    expect(productCallback).toHaveBeenCalledWith({ id: 2, middleware: 'product' });
    expect(orderCallback).toHaveBeenCalledWith({ id: 3 }); // No middleware applied
  });
  
  test('middleware with wildcard pattern should affect all matching events', async () => {
    const allEventsMiddleware = vi.fn((event, data) => {
      return { ...data, processedBy: 'all' };
    });
    
    const createdEventsMiddleware = vi.fn((event, data) => {
      return { ...data, processedBy: 'created' };
    });
    
    // Register middleware for all events
    emitter.use({ 
      pattern: '*', 
      handler: allEventsMiddleware 
    });
    
    // Register middleware for created events
    emitter.use({ 
      pattern: '*.created', 
      handler: createdEventsMiddleware 
    });
    
    const userCreatedCallback = vi.fn();
    const productCreatedCallback = vi.fn();
    const userUpdatedCallback = vi.fn();
    
    emitter.subscribe('user.created', userCreatedCallback);
    emitter.subscribe('product.created', productCreatedCallback);
    emitter.subscribe('user.updated', userUpdatedCallback);
    
    // Publish events
    await emitter.publish('user.created', { id: 1 });
    await emitter.publish('product.created', { id: 2 });
    await emitter.publish('user.updated', { id: 3 });
    
    // Check middleware was called correctly
    expect(allEventsMiddleware).toHaveBeenCalledTimes(3);
    expect(createdEventsMiddleware).toHaveBeenCalledTimes(2);
    
    // Check data was modified correctly by both middlewares for created events
    expect(userCreatedCallback).toHaveBeenCalledWith({ id: 1, processedBy: 'created' });
    expect(productCreatedCallback).toHaveBeenCalledWith({ id: 2, processedBy: 'created' });
    
    // Check data was modified only by 'all' middleware for updated event
    expect(userUpdatedCallback).toHaveBeenCalledWith({ id: 3, processedBy: 'all' });
  });
  
  test('middleware without pattern should apply to all events', async () => {
    const globalMiddleware = vi.fn((event, data) => {
      return { ...data, global: true };
    });
    
    // Register global middleware without pattern
    emitter.use(globalMiddleware);
    
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    emitter.subscribe('event1', callback1);
    emitter.subscribe('event2', callback2);
    
    await emitter.publish('event1', { id: 1 });
    await emitter.publish('event2', { id: 2 });
    
    expect(globalMiddleware).toHaveBeenCalledTimes(2);
    expect(callback1).toHaveBeenCalledWith({ id: 1, global: true });
    expect(callback2).toHaveBeenCalledWith({ id: 2, global: true });
  });
  
  test('middleware should be applied in registration order', async () => {
    // First middleware - adds firstRun
    emitter.use((event, data) => {
      return { ...data, firstRun: true };
    });
    
    // Second middleware - adds secondRun
    emitter.use((event, data) => {
      return { ...data, secondRun: true };
    });
    
    const callback = vi.fn();
    emitter.subscribe('test', callback);
    
    await emitter.publish('test', { original: true });
    
    expect(callback).toHaveBeenCalledWith({
      original: true,
      firstRun: true,
      secondRun: true
    });
  });
  
  test('removing middleware should work correctly', async () => {
    const middleware1: MiddlewareConfig = {
      pattern: 'user.*',
      handler: vi.fn((event, data) => {
        return { ...data, middleware1: true };
      })
    };
    
    const middleware2 = vi.fn((event, data) => {
      return { ...data, middleware2: true };
    });
    
    emitter.use(middleware1);
    emitter.use(middleware2);
    
    const callback = vi.fn();
    emitter.subscribe('user.created', callback);
    
    // First publish should use both middlewares
    await emitter.publish('user.created', { id: 1 });
    expect(callback).toHaveBeenCalledWith({
      id: 1,
      middleware1: true,
      middleware2: true
    });
    
    // Remove first middleware
    emitter.removeMiddleware(middleware1);
    
    // Second publish should only use the second middleware
    await emitter.publish('user.created', { id: 2 });
    expect(callback).toHaveBeenCalledWith({
      id: 2,
      middleware2: true
    });
    
    // Remove second middleware
    emitter.removeMiddleware(middleware2);
    
    // Third publish should use no middleware
    await emitter.publish('user.created', { id: 3 });
    expect(callback).toHaveBeenCalledWith({ id: 3 });
  });
});