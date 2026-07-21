import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataPath } from "./dataDir.js";

export interface AsleepQueueMessage {
  id: string;
  fromDid?: string;
  enqueuedAt: string;
  ttlMs: number;
  /** Opaque ciphertext — base64 or hex encoding. */
  blobEncoding: "base64" | "hex";
  blob: string;
}

export interface AsleepQueueEnqueueInput {
  blob: Buffer;
  fromDid?: string;
  ttlMs?: number;
  blobEncoding?: "base64" | "hex";
}

export interface AsleepQueueOptions {
  dirPath?: string;
  maxMessages?: number;
  maxTotalBytes?: number;
  defaultTtlMs?: number;
  maxPendingPerPeer?: number;
  now?: () => Date;
}

const INDEX_FILE = "index.json";
export const ASLEEP_QUEUE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ASLEEP_QUEUE_MAX_MESSAGES = 500;
export const ASLEEP_QUEUE_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
export const ASLEEP_QUEUE_MAX_PENDING_PER_PEER = 50;

export class AsleepQueueStore {
  private readonly dirPath: string;
  private readonly maxMessages: number;
  private readonly maxTotalBytes: number;
  private readonly defaultTtlMs: number;
  private readonly maxPendingPerPeer: number;
  private readonly now: () => Date;
  private index: AsleepQueueMessage[] | null = null;

  constructor(options: AsleepQueueOptions = {}) {
    this.dirPath = options.dirPath ?? resolveDataPath("asleep-inbox");
    this.maxMessages = options.maxMessages ?? ASLEEP_QUEUE_MAX_MESSAGES;
    this.maxTotalBytes = options.maxTotalBytes ?? ASLEEP_QUEUE_MAX_TOTAL_BYTES;
    this.defaultTtlMs = options.defaultTtlMs ?? ASLEEP_QUEUE_DEFAULT_TTL_MS;
    this.maxPendingPerPeer = options.maxPendingPerPeer ?? ASLEEP_QUEUE_MAX_PENDING_PER_PEER;
    this.now = options.now ?? (() => new Date());
  }

  private indexPath(): string {
    return path.join(this.dirPath, INDEX_FILE);
  }

  private loadIndex(): AsleepQueueMessage[] {
    if (this.index) return this.index;
    try {
      const raw = fs.readFileSync(this.indexPath(), "utf8");
      const parsed = JSON.parse(raw) as AsleepQueueMessage[];
      this.index = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.index = [];
    }
    return this.index;
  }

  private persistIndex(messages: AsleepQueueMessage[]): void {
    this.index = messages;
    fs.mkdirSync(this.dirPath, { recursive: true });
    fs.writeFileSync(this.indexPath(), `${JSON.stringify(messages, null, 2)}\n`, "utf8");
  }

  private blobByteLength(message: AsleepQueueMessage): number {
    if (message.blobEncoding === "hex") {
      return Math.ceil(message.blob.length / 2);
    }
    return Buffer.byteLength(message.blob, "base64");
  }

  private totalBytes(messages: AsleepQueueMessage[]): number {
    return messages.reduce((sum, message) => sum + this.blobByteLength(message), 0);
  }

  private countForPeer(messages: AsleepQueueMessage[], fromDid: string | undefined): number {
    if (!fromDid) return 0;
    return messages.filter((message) => message.fromDid === fromDid).length;
  }

  private isExpired(message: AsleepQueueMessage, at: Date): boolean {
    const enqueuedAt = Date.parse(message.enqueuedAt);
    if (!Number.isFinite(enqueuedAt)) return true;
    return at.getTime() - enqueuedAt > message.ttlMs;
  }

  list(includeExpired = false): AsleepQueueMessage[] {
    const at = this.now();
    const messages = this.loadIndex();
    if (includeExpired) return [...messages];
    return messages.filter((message) => !this.isExpired(message, at));
  }

  enqueue(input: AsleepQueueEnqueueInput): AsleepQueueMessage {
    const at = this.now();
    const live = this.list(false);
    const fromDid = input.fromDid?.trim() || undefined;

    if (live.length >= this.maxMessages) {
      throw new Error("asleep-inbox full (500 message cap)");
    }
    if (fromDid && this.countForPeer(live, fromDid) >= this.maxPendingPerPeer) {
      throw new Error(`asleep-inbox peer cap reached for ${fromDid}`);
    }

    const encoding = input.blobEncoding ?? "base64";
    const blob =
      encoding === "hex" ? input.blob.toString("hex") : input.blob.toString("base64");
    const blobBytes = input.blob.byteLength;
    if (this.totalBytes(live) + blobBytes > this.maxTotalBytes) {
      throw new Error("asleep-inbox full (2MB total cap)");
    }

    const record: AsleepQueueMessage = {
      id: randomUUID(),
      fromDid,
      enqueuedAt: at.toISOString(),
      ttlMs: input.ttlMs ?? this.defaultTtlMs,
      blobEncoding: encoding,
      blob,
    };
    this.persistIndex([...this.loadIndex(), record]);
    return record;
  }

  /** Remove acknowledged ids after owner wake processing. */
  drain(ackIds: string[]): AsleepQueueMessage[] {
    const ack = new Set(ackIds.map((id) => id.trim()).filter(Boolean));
    if (ack.size === 0) return [];
    const all = this.loadIndex();
    const removed = all.filter((message) => ack.has(message.id));
    const kept = all.filter((message) => !ack.has(message.id));
    this.persistIndex(kept);
    return removed;
  }

  purgeExpired(): number {
    const at = this.now();
    const all = this.loadIndex();
    const kept = all.filter((message) => !this.isExpired(message, at));
    const removed = all.length - kept.length;
    if (removed > 0) {
      this.persistIndex(kept);
    }
    return removed;
  }
}
