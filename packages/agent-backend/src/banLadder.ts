/**
 * Human ban ladder (D087 / AS-09). Spec companion: docs/04-security/19-ban-ladder.md
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export type BanRung = 1 | 2 | 3 | 4;

export const BAN_RUNG_DAYS: Record<BanRung, number | null> = {
  1: 7,
  2: 30,
  3: 90,
  4: null, // life
};

export interface BanRecord {
  id: string;
  subjectKey: string;
  rung: BanRung;
  reason: string;
  evidenceRef: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  circumventionFlag: boolean;
}

export function rungDurationMs(rung: BanRung): number | null {
  const days = BAN_RUNG_DAYS[rung];
  return days === null ? null : days * 86_400_000;
}

export function nextRung(current: BanRung | 0): BanRung {
  if (current >= 4) return 4;
  return (current + 1) as BanRung;
}

export class BanLadderStore {
  private readonly filePath: string;
  private db: DatabaseSync | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bans (
        id TEXT PRIMARY KEY,
        subject_key TEXT NOT NULL,
        rung INTEGER NOT NULL,
        reason TEXT NOT NULL,
        evidence_ref TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT,
        active INTEGER NOT NULL,
        circumvention_flag INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS bans_subject ON bans(subject_key, active);
    `);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private requireDb(): DatabaseSync {
    if (!this.db) throw new Error("BanLadderStore not loaded");
    return this.db;
  }

  /** Active ban if any (life or not yet expired). */
  getActiveBan(subjectKey: string, now = Date.now()): BanRecord | null {
    const rows = this.requireDb()
      .prepare(
        `SELECT id, subject_key, rung, reason, evidence_ref, starts_at, ends_at, active, circumvention_flag
         FROM bans WHERE subject_key = ? AND active = 1 ORDER BY starts_at DESC`,
      )
      .all(subjectKey.trim()) as Array<{
      id: string;
      subject_key: string;
      rung: number;
      reason: string;
      evidence_ref: string;
      starts_at: string;
      ends_at: string | null;
      active: number;
      circumvention_flag: number;
    }>;
    for (const row of rows) {
      if (row.ends_at && Date.parse(row.ends_at) <= now) {
        this.requireDb().prepare(`UPDATE bans SET active = 0 WHERE id = ?`).run(row.id);
        continue;
      }
      return {
        id: row.id,
        subjectKey: row.subject_key,
        rung: row.rung as BanRung,
        reason: row.reason,
        evidenceRef: row.evidence_ref,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        active: true,
        circumventionFlag: row.circumvention_flag === 1,
      };
    }
    return null;
  }

  applyBan(input: {
    subjectKey: string;
    reason: string;
    evidenceRef: string;
    circumvention?: boolean;
    forceRung?: BanRung;
  }): BanRecord {
    const existing = this.getActiveBan(input.subjectKey);
    if (existing) {
      this.requireDb().prepare(`UPDATE bans SET active = 0 WHERE id = ?`).run(existing.id);
    }
    const baseRung = input.forceRung ?? nextRung((existing?.rung ?? 0) as BanRung | 0);
    const rung = input.circumvention ? nextRung(baseRung) : baseRung;
    const startsAt = new Date().toISOString();
    const dur = rungDurationMs(rung);
    const endsAt = dur === null ? null : new Date(Date.now() + dur).toISOString();
    const record: BanRecord = {
      id: randomUUID(),
      subjectKey: input.subjectKey.trim(),
      rung,
      reason: input.reason.trim(),
      evidenceRef: input.evidenceRef.trim(),
      startsAt,
      endsAt,
      active: true,
      circumventionFlag: Boolean(input.circumvention),
    };
    this.requireDb()
      .prepare(
        `INSERT INTO bans (id, subject_key, rung, reason, evidence_ref, starts_at, ends_at, active, circumvention_flag)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        record.id,
        record.subjectKey,
        record.rung,
        record.reason,
        record.evidenceRef,
        record.startsAt,
        record.endsAt,
        record.circumventionFlag ? 1 : 0,
      );
    return record;
  }

  listActive(limit = 100): BanRecord[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT id, subject_key, rung, reason, evidence_ref, starts_at, ends_at, active, circumvention_flag
         FROM bans WHERE active = 1 ORDER BY starts_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: string;
      subject_key: string;
      rung: number;
      reason: string;
      evidence_ref: string;
      starts_at: string;
      ends_at: string | null;
      active: number;
      circumvention_flag: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      subjectKey: row.subject_key,
      rung: row.rung as BanRung,
      reason: row.reason,
      evidenceRef: row.evidence_ref,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      active: true,
      circumventionFlag: row.circumvention_flag === 1,
    }));
  }
}
