const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const VALID_ENVIRONMENTS = ['dev', 'staging', 'preprod', 'uat', 'prod', 'all'];
const VALID_RISK_LEVELS = ['low', 'medium', 'high'];
const VALID_ROLLBACK_MODES = ['manual', 'auto'];
const VALID_COMPLIANCE_MODES = ['SOX', 'PCI_DSS', 'HIPAA', 'GDPR', 'none'];
const VALID_TYPES = ['ddl', 'dml'];
const VALID_DML_OPERATIONS = ['insert', 'update', 'delete'];

const baseChangesetSchema = z.object({
  id: z.string().min(1, 'Changeset @id is required'),
  author: z.string().min(1, 'Changeset @author is required'),
  type: z.enum(VALID_TYPES, { errorMap: () => ({ message: `@type must be one of: ${VALID_TYPES.join(', ')}` }) }),
  description: z.string().min(1, 'Changeset @description is required'),
  ticket: z.string().min(1, 'Changeset @ticket is required'),
  environment: z.enum(VALID_ENVIRONMENTS, {
    errorMap: () => ({ message: `@environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}` }),
  }),
  risk: z.enum(VALID_RISK_LEVELS, {
    errorMap: () => ({ message: `@risk must be one of: ${VALID_RISK_LEVELS.join(', ')}` }),
  }),
  reviewers: z.string().min(1, 'Changeset @reviewers is required'),
  rollback: z.enum(VALID_ROLLBACK_MODES, {
    errorMap: () => ({ message: `@rollback must be one of: ${VALID_ROLLBACK_MODES.join(', ')}` }),
  }),
  compliance: z.string().min(1, 'Changeset @compliance is required'),
  schedule: z.string().default('immediate'),
});

const dmlExtensionSchema = z.object({
  operation: z.enum(VALID_DML_OPERATIONS, {
    errorMap: () => ({ message: `@operation must be one of: ${VALID_DML_OPERATIONS.join(', ')}` }),
  }),
  target_table: z.string().min(1, '@target_table is required for DML changesets'),
  estimated_rows: z.string().min(1, '@estimated_rows is required for DML changesets'),
  requires_backup: z.enum(['true', 'false'], {
    errorMap: () => ({ message: '@requires_backup must be true or false' }),
  }),
  backup_query: z.string().optional(),
});

const METADATA_REGEX = /^--\s*@(\w+):\s*(.+)$/;
const ROLLBACK_MARKER = /^--\s*rollback\s*$/im;
const METADATA_BLOCK_END = /^--\s*={3,}\s*$/;

/**
 * Extracts metadata key-value pairs from the SQL comment header.
 * Handles the 3-separator format: ===, title, ===, fields, ===
 * @param {string} content - Raw file content
 * @returns {{ metadata: Record<string, string>, metadataEndLine: number }}
 */
function extractMetadata(content) {
  const lines = content.split('\n');
  const metadata = {};
  let metadataEndLine = 0;
  let separatorCount = 0;
  let foundFirstField = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (METADATA_BLOCK_END.test(line)) {
      separatorCount++;
      if (foundFirstField) {
        metadataEndLine = i;
        break;
      }
      continue;
    }

    const match = line.match(METADATA_REGEX);
    if (match && separatorCount >= 1) {
      foundFirstField = true;
      metadata[match[1]] = match[2].trim();
    }
  }

  return { metadata, metadataEndLine };
}

/**
 * Extracts the SQL body between the metadata block end and the rollback marker.
 * @param {string} content - Raw file content
 * @param {number} metadataEndLine - Line index where metadata block ends
 * @returns {{ sqlBody: string, rollbackSql: string }}
 */
function extractSqlParts(content, metadataEndLine) {
  const lines = content.split('\n');
  const postMetadata = lines.slice(metadataEndLine + 1);
  const joined = postMetadata.join('\n');

  const rollbackMatch = joined.match(ROLLBACK_MARKER);

  let sqlBody;
  let rollbackSql = '';

  if (rollbackMatch) {
    const rollbackIndex = joined.indexOf(rollbackMatch[0]);
    sqlBody = joined.substring(0, rollbackIndex).trim();
    rollbackSql = joined.substring(rollbackIndex + rollbackMatch[0].length).trim();
  } else {
    sqlBody = joined.trim();
  }

  // Strip Liquibase directives (-- changeset, -- labels, -- context) from sqlBody
  sqlBody = sqlBody
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith('-- changeset ') &&
        !trimmed.startsWith('-- labels:') &&
        !trimmed.startsWith('-- context:')
      );
    })
    .join('\n')
    .trim();

  // Strip comment prefixes from rollback SQL lines
  rollbackSql = rollbackSql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('-- ')) return trimmed.substring(3);
      if (trimmed === '--') return '';
      return trimmed;
    })
    .join('\n')
    .trim();

  return { sqlBody, rollbackSql };
}

/**
 * Validates the schedule field format.
 * @param {string} schedule - The schedule value
 * @returns {boolean}
 */
function isValidSchedule(schedule) {
  if (schedule === 'immediate') return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(schedule)) return false;
  const date = new Date(schedule);
  return !isNaN(date.getTime());
}

/**
 * Validates compliance field values.
 * @param {string} compliance - Comma-separated compliance values
 * @returns {string[]}
 */
function parseCompliance(compliance) {
  return compliance.split(',').map((c) => c.trim());
}

/**
 * Parses a SQL changeset file and extracts all metadata, SQL body, and rollback SQL.
 *
 * @param {string} filePath - Absolute or relative path to the .sql changeset file
 * @returns {object} Structured changeset object
 * @throws {Error} If file cannot be read or required metadata is missing
 */
function parseChangeset(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Changeset file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const filename = path.basename(absolutePath);

  if (!filename.endsWith('.sql')) {
    throw new Error(`Changeset file must be a .sql file, got: ${filename}`);
  }

  const { metadata, metadataEndLine } = extractMetadata(content);

  if (Object.keys(metadata).length === 0) {
    throw new Error(
      `No metadata found in ${filename}. Ensure the file has a metadata block starting and ending with "-- ===..."`
    );
  }

  // Validate base fields
  const baseResult = baseChangesetSchema.safeParse(metadata);
  if (!baseResult.success) {
    const errors = baseResult.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Changeset validation failed for ${filename}: ${errors}`);
  }

  // Validate schedule format
  if (!isValidSchedule(metadata.schedule || 'immediate')) {
    throw new Error(
      `Invalid @schedule format in ${filename}. Must be "immediate" or ISO8601 "YYYY-MM-DDTHH:MM"`
    );
  }

  // Validate compliance values
  const complianceValues = parseCompliance(metadata.compliance);
  for (const val of complianceValues) {
    if (!VALID_COMPLIANCE_MODES.includes(val)) {
      throw new Error(
        `Invalid @compliance value "${val}" in ${filename}. Must be one of: ${VALID_COMPLIANCE_MODES.join(', ')}`
      );
    }
  }

  const isDml = metadata.type === 'dml';

  // Validate DML-specific fields
  if (isDml) {
    const dmlResult = dmlExtensionSchema.safeParse(metadata);
    if (!dmlResult.success) {
      const errors = dmlResult.error.issues.map((i) => i.message).join('; ');
      throw new Error(`DML changeset validation failed for ${filename}: ${errors}`);
    }

    if (metadata.requires_backup === 'true' && !metadata.backup_query) {
      throw new Error(
        `@backup_query is required when @requires_backup is true in ${filename}`
      );
    }
  }

  const { sqlBody, rollbackSql } = extractSqlParts(content, metadataEndLine);

  if (!sqlBody) {
    throw new Error(`No SQL body found in ${filename}. The changeset must contain SQL statements.`);
  }

  const changeset = {
    id: metadata.id,
    author: metadata.author,
    type: metadata.type,
    description: metadata.description,
    ticket: metadata.ticket,
    environment: metadata.environment,
    risk: metadata.risk,
    reviewers: metadata.reviewers.split(',').map((r) => r.trim()),
    rollback: metadata.rollback,
    compliance: complianceValues,
    schedule: metadata.schedule || 'immediate',
    sqlBody,
    rollbackSql,
    filename,
    filePath: absolutePath,
    gitAuthor: metadata.author,
    prNumber: null,
    jiraTicketId: null,
  };

  if (isDml) {
    changeset.operation = metadata.operation;
    changeset.targetTable = metadata.target_table;
    changeset.estimatedRows = parseInt(metadata.estimated_rows, 10);
    changeset.requiresBackup = metadata.requires_backup === 'true';
    changeset.backupQuery = metadata.backup_query || null;
  }

  return changeset;
}

/**
 * Parses multiple changeset files from a directory.
 * @param {string} dirPath - Path to directory containing .sql files
 * @returns {object[]} Array of parsed changeset objects
 */
function parseChangesetDirectory(dirPath) {
  const absoluteDir = path.resolve(dirPath);

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Directory not found: ${absoluteDir}`);
  }

  const files = fs.readdirSync(absoluteDir, { recursive: true });
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));

  return sqlFiles.map((f) => parseChangeset(path.join(absoluteDir, f)));
}

module.exports = {
  parseChangeset,
  parseChangesetDirectory,
  extractMetadata,
  extractSqlParts,
  isValidSchedule,
  VALID_ENVIRONMENTS,
  VALID_RISK_LEVELS,
  VALID_TYPES,
  VALID_DML_OPERATIONS,
  VALID_COMPLIANCE_MODES,
};
