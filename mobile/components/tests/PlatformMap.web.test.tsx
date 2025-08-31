describe('PlatformMap.web import', () => {
    it('does not throw on import (no native deps)', () => {
      expect(() => {
        jest.isolateModules(() => require('../PlatformMap.web'));
      }).not.toThrow();
    });
  });
  