import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('engine placeholder', () => {
  it('should export package name', () => {
    expect(PACKAGE_NAME).toBe('@family-menu/engine');
  });
});
