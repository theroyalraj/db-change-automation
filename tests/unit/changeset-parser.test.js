const path = require('path');
const {
  parseChangeset,
  extractMetadata,
  isValidSchedule,
} = require('../../scripts/core/changeset-parser');

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const DDL_EXAMPLE = path.resolve(
  __dirname,
  '..',
  '..',
  'changelogs',
  'migrations',
  'example',
  '20260228-001-add-email-verified.sql'
);
const DML_EXAMPLE = path.resolve(
  __dirname,
  '..',
  '..',
  'changelogs',
  'dml',
  'example',
  '20260228-001-seed-config.sql'
);

describe('changeset-parser', () => {
  describe('parseChangeset — DDL', () => {
    it('should parse a valid DDL changeset with all fields', () => {
      const result = parseChangeset(DDL_EXAMPLE);

      expect(result.id).toBe('20260228-001-add-email-verified');
      expect(result.author).toBe('john.doe');
      expect(result.type).toBe('ddl');
      expect(result.description).toBe(
        'Add email_verified boolean column to users table'
      );
      expect(result.ticket).toBe('PROJ-123');
      expect(result.environment).toBe('prod');
      expect(result.risk).toBe('medium');
      expect(result.reviewers).toEqual(['dba-team']);
      expect(result.rollback).toBe('auto');
      expect(result.compliance).toEqual(['SOX']);
      expect(result.schedule).toBe('immediate');
      expect(result.sqlBody).toContain('ALTER TABLE users ADD COLUMN email_verified');
      expect(result.rollbackSql).toContain('ALTER TABLE users DROP COLUMN email_verified');
      expect(result.filename).toBe('20260228-001-add-email-verified.sql');
      expect(result.prNumber).toBeNull();
      expect(result.jiraTicketId).toBeNull();
    });

    it('should not include DML-specific fields for DDL changesets', () => {
      const result = parseChangeset(DDL_EXAMPLE);
      expect(result.operation).toBeUndefined();
      expect(result.targetTable).toBeUndefined();
      expect(result.estimatedRows).toBeUndefined();
      expect(result.requiresBackup).toBeUndefined();
      expect(result.backupQuery).toBeUndefined();
    });
  });

  describe('parseChangeset — DML', () => {
    it('should parse a valid DML changeset with all fields', () => {
      const result = parseChangeset(DML_EXAMPLE);

      expect(result.id).toBe('20260228-001-seed-config');
      expect(result.author).toBe('jane.smith');
      expect(result.type).toBe('dml');
      expect(result.operation).toBe('insert');
      expect(result.targetTable).toBe('config_settings');
      expect(result.estimatedRows).toBe(3);
      expect(result.requiresBackup).toBe(false);
      expect(result.sqlBody).toContain('INSERT INTO config_settings');
      expect(result.rollbackSql).toContain('DELETE FROM config_settings');
    });
  });

  describe('parseChangeset — error cases', () => {
    it('should throw on non-existent file', () => {
      expect(() => parseChangeset('/nonexistent/file.sql')).toThrow(
        'Changeset file not found'
      );
    });

    it('should throw on non-.sql file', () => {
      const readmePath = path.resolve(
        __dirname,
        '..',
        '..',
        'package.json'
      );
      expect(() => parseChangeset(readmePath)).toThrow(
        'must be a .sql file'
      );
    });

    it('should throw when metadata is missing', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'no-metadata.sql');
      expect(() => parseChangeset(fixturePath)).toThrow('No metadata found');
    });

    it('should throw on missing required fields', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'missing-fields.sql');
      expect(() => parseChangeset(fixturePath)).toThrow(
        'Changeset validation failed'
      );
    });

    it('should throw on missing rollback when type is DML with requires_backup but no backup_query', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'dml-no-backup-query.sql');
      expect(() => parseChangeset(fixturePath)).toThrow(
        '@backup_query is required when @requires_backup is true'
      );
    });
  });

  describe('isValidSchedule', () => {
    it('should accept "immediate"', () => {
      expect(isValidSchedule('immediate')).toBe(true);
    });

    it('should accept valid ISO8601 datetime', () => {
      expect(isValidSchedule('2026-03-15T14:30')).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(isValidSchedule('tomorrow')).toBe(false);
      expect(isValidSchedule('2026-13-01T25:00')).toBe(false);
      expect(isValidSchedule('')).toBe(false);
    });
  });

  describe('extractMetadata', () => {
    it('should extract metadata from a properly formatted header', () => {
      const content = [
        '-- ============================================================',
        '-- @id:          test-001',
        '-- @author:      test.user',
        '-- ============================================================',
        'SELECT 1;',
      ].join('\n');

      const { metadata } = extractMetadata(content);
      expect(metadata.id).toBe('test-001');
      expect(metadata.author).toBe('test.user');
    });
  });
});
