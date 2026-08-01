import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { ReplayGuard, type ReplayGuardSnapshot } from "@qwixl/protocol";
import { resolveDataPath } from "./dataDir.js";

const REPLAY_FILE = "replay-guard.json";
const SCHEMA_VERSION = 1;

interface ReplayFile {
  schemaVersion: number;
  snapshot: ReplayGuardSnapshot;
}

/**
 * RI-08. Durable replay rejection.
 *
 * The guard itself is in-memory, so before this every restart re-admitted every
 * object a peer cared to resend. Writing on each admit would put a disk write in
 * the path of every inbound object, so this snapshots on an interval and on
 * shutdown instead — the exposure that leaves is a crash losing at most one
 * interval of admissions, which is a far smaller window than "everything since
 * boot".
 */
export class ReplayGuardStore {
  readonly guard: ReplayGuard;
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | undefined;
  private persistedAdmissions = 0;

  constructor(guard: ReplayGuard = new ReplayGuard(), filePath = resolveDataPath(REPLAY_FILE)) {
    this.guard = guard;
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<ReplayFile>(this.filePath);
    if (!file?.snapshot) return;
    try {
      this.guard.restore(file.snapshot);
    } catch (error) {
      // A snapshot we cannot read must not stop the agent booting; the cost is
      // a window where replays are admitted, not a failure to start.
      console.warn(
        `[replay] snapshot ignored: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Begin periodic snapshots. Safe to call once; repeat calls are ignored. */
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.persist(), intervalMs);
    // Snapshotting must not be the reason a process stays alive.
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Snapshot now and wait for it to reach disk. */
  async flush(): Promise<void> {
    this.persist();
    await this.persistQueue;
  }

  private persist(): void {
    // Nothing admitted since the last write means the snapshot on disk is still
    // accurate. Skipping here is what keeps an idle agent off the disk entirely.
    if (this.guard.admissions === this.persistedAdmissions) return;
    this.persistedAdmissions = this.guard.admissions;
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          snapshot: this.guard.snapshot(),
        } satisfies ReplayFile);
      })
      .catch((error) => {
        console.warn(
          `[replay] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
