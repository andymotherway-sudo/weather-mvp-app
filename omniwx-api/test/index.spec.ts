import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('worker module', () => {
  it('exports a fetch handler', () => {
    expect(typeof worker.fetch).toBe('function');
  });
});
