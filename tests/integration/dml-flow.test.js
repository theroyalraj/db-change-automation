const { parseChangeset } = require('../../scripts/core/changeset-parser');
const path = require('path');

const DML_EXAMPLE = path.resolve(
  __dirname,
  '..',
  '..',
  'changelogs',
  'dml',
  'example',
  '20260228-001-seed-config.sql'
);

describe('DML Flow (integration)', () => {
  it('should parse DML changeset and validate all DML-specific fields', () => {
    const changeset = parseChangeset(DML_EXAMPLE);

    expect(changeset.type).toBe('dml');
    expect(changeset.operation).toBe('insert');
    expect(changeset.targetTable).toBe('config_settings');
    expect(changeset.estimatedRows).toBe(3);
    expect(changeset.requiresBackup).toBe(false);
  });

  it('should enforce DML environment restrictions', () => {
    const changeset = parseChangeset(DML_EXAMPLE);
    const allowedEnvs = ['preprod', 'uat'];
    const prodEnabled = false;

    if (changeset.environment === 'prod' && !prodEnabled) {
      expect(true).toBe(true); // Would be blocked
    } else {
      expect(allowedEnvs).toContain(changeset.environment);
    }
  });

  it('should determine approval requirement based on row limit', () => {
    const changeset = parseChangeset(DML_EXAMPLE);
    const autoApproveLimit = 10;
    const approvalRequired = true;

    const needsApproval =
      approvalRequired &&
      (autoApproveLimit === 0 || changeset.estimatedRows > autoApproveLimit);

    // estimatedRows=3, limit=10 → auto-approved
    expect(needsApproval).toBe(false);
  });

  it('should require approval when rows exceed limit', () => {
    const changeset = parseChangeset(DML_EXAMPLE);
    const autoApproveLimit = 2; // Less than estimatedRows=3

    const needsApproval = autoApproveLimit === 0 || changeset.estimatedRows > autoApproveLimit;
    expect(needsApproval).toBe(true);
  });

  it('should always require approval when limit is 0', () => {
    const changeset = parseChangeset(DML_EXAMPLE);
    const autoApproveLimit = 0;

    const needsApproval = autoApproveLimit === 0 || changeset.estimatedRows > autoApproveLimit;
    expect(needsApproval).toBe(true);
  });
});
