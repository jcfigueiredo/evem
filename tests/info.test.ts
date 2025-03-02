import { describe, test, expect, beforeEach } from 'vitest';
import { EvEm, MiddlewareConfig } from '../src';

describe('Event Emitter Info Method', () => {
  let emitter: EvEm;
  
  beforeEach(() => {
    emitter = new EvEm();
  });
  
  test('should return empty array when no events or middleware', () => {
    const info = emitter.info();
    expect(info).toEqual([]);
  });
  
  test('should return info about all subscriptions', () => {
    // Add some subscriptions
    const sub1 = emitter.subscribe('user.login', () => {});
    const sub2 = emitter.subscribe('user.logout', () => {});
    const sub3 = emitter.subscribe('product.created', () => {}, { priority: 'high' });
    
    const info = emitter.info();
    
    expect(info).toHaveLength(3);
    
    // Verify subscription details
    expect(info.filter(i => !i.isMiddleware)).toHaveLength(3);
    expect(info.find(i => i.id === sub1)).toMatchObject({
      event: 'user.login',
      isMiddleware: false,
      priority: 0
    });
    expect(info.find(i => i.id === sub3)).toMatchObject({
      event: 'product.created',
      isMiddleware: false,
      priority: 100 // 'high' maps to 100
    });
  });
  
  test('should return info about all middleware', () => {
    // Add global middleware
    emitter.use(() => ({}));
    
    // Add pattern-specific middleware
    const userMiddleware: MiddlewareConfig = {
      pattern: 'user.*',
      handler: () => ({})
    };
    emitter.use(userMiddleware);
    
    const info = emitter.info();
    
    expect(info).toHaveLength(2);
    
    // Verify middleware details
    const middlewareInfos = info.filter(i => i.isMiddleware);
    expect(middlewareInfos).toHaveLength(2);
    
    // Global middleware
    expect(middlewareInfos.find(i => i.event === '*')).toMatchObject({
      event: '*',
      isMiddleware: true
    });
    
    // User middleware
    expect(middlewareInfos.find(i => i.event === 'user.*')).toMatchObject({
      event: 'user.*',
      isMiddleware: true,
      pattern: 'user.*'
    });
  });
  
  test('should filter results based on provided pattern', () => {
    // Add various subscriptions
    emitter.subscribe('user.login', () => {});
    emitter.subscribe('user.logout', () => {});
    emitter.subscribe('product.created', () => {});
    
    // Add middleware
    emitter.use(() => ({})); // Global middleware
    emitter.use({ pattern: 'user.*', handler: () => ({}) });
    emitter.use({ pattern: 'product.*', handler: () => ({}) });
    
    // Get info about user events only
    const userInfo = emitter.info('user.*');
    
    // Should include:
    // - Two user event subscriptions
    // - Global middleware (matches all patterns)
    // - User middleware
    expect(userInfo).toHaveLength(4);
    expect(userInfo.filter(i => !i.isMiddleware)).toHaveLength(2);
    expect(userInfo.filter(i => !i.isMiddleware).map(i => i.event)).toEqual(['user.login', 'user.logout']);
    expect(userInfo.filter(i => i.isMiddleware)).toHaveLength(2);
    expect(userInfo.filter(i => i.isMiddleware).map(i => i.event)).toContain('*');
    expect(userInfo.filter(i => i.isMiddleware).map(i => i.event)).toContain('user.*');
    
    // Verify product middleware isn't included
    expect(userInfo.filter(i => i.isMiddleware).map(i => i.event)).not.toContain('product.*');
  });
});