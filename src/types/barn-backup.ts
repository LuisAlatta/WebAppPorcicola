export const BARN_BACKUP_LIMITS = { bytes: 8 * 1024 * 1024, rows: 20000, cellBytes: 512 * 1024, requestBytes: 8 * 1024 * 1024 + 16384 } as const;
export type BarnBackupValue = string | number | null;
export type BarnBackupRow = Record<string, BarnBackupValue>;
export interface BarnBackup {
  format: 'webporcicola-barn-backup';
  version: 1;
  exportedAt: string;
  barnId: number;
  tables: Record<string, BarnBackupRow[]>;
  /** Snapshots externos: nunca se crean usuarios, configuración ni otros galpones. */
  references: Record<string, BarnBackupRow[]>;
  /** Constancia retenida en la misma base: impide importar respaldos alterados. */
  manifest: { schemaHash: string; digest: string; exportOperationId: string };
}
export interface ImportBarnBackupInput {
  backup: BarnBackup;
  operationKey: string;
  reason: string;
}
export interface ImportBarnBackupResult {
  barnId: number;
  code: string;
  name: string;
  replayed?: boolean;
}
