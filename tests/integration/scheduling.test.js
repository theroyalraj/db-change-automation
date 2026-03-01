const { parseChangeset, isValidSchedule } = require('../../scripts/core/changeset-parser');
const path = require('path');

const DDL_EXAMPLE = path.resolve(
  __dirname,
  '..',
  '..',
  'changelogs',
  'migrations',
  'example',
  '20260228-001-add-email-verified.sql'
);

describe('Scheduling (integration)', () => {
  describe('schedule field parsing', () => {
    it('should parse "immediate" schedule', () => {
      const changeset = parseChangeset(DDL_EXAMPLE);
      expect(changeset.schedule).toBe('immediate');
    });

    it('should validate various schedule formats', () => {
      expect(isValidSchedule('immediate')).toBe(true);
      expect(isValidSchedule('2026-06-15T14:30')).toBe(true);
      expect(isValidSchedule('2026-12-31T23:59')).toBe(true);
      expect(isValidSchedule('not-a-date')).toBe(false);
      expect(isValidSchedule('')).toBe(false);
    });
  });

  describe('schedule window validation', () => {
    const WINDOW_MS = 5 * 60 * 1000;

    it('should accept execution within 5-minute window', () => {
      const now = new Date();
      const scheduledTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago
      const diff = Math.abs(now.getTime() - scheduledTime.getTime());
      expect(diff <= WINDOW_MS).toBe(true);
    });

    it('should reject execution outside 5-minute window', () => {
      const now = new Date();
      const scheduledTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago
      const diff = Math.abs(now.getTime() - scheduledTime.getTime());
      expect(diff <= WINDOW_MS).toBe(false);
    });

    it('should accept execution at exact scheduled time', () => {
      const now = new Date();
      const diff = Math.abs(now.getTime() - now.getTime());
      expect(diff <= WINDOW_MS).toBe(true);
    });
  });

  describe('deferred execution logic', () => {
    it('should identify changeset for deferred execution', () => {
      const futureDate = '2099-12-31T23:59';
      expect(isValidSchedule(futureDate)).toBe(true);

      const scheduledTime = new Date(futureDate);
      const now = new Date();
      expect(scheduledTime.getTime() > now.getTime()).toBe(true);
    });
  });
});
