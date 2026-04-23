import type {
  DeltaSnapshotMsg,
  FullSnapshotMsg,
  ServerMsg,
  SnapshotV2Msg,
} from "@3body/shared";

type MessageType = ServerMsg["type"];

interface ByteStats {
  avg: number;
  count: number;
  max: number;
  min: number;
  p50: number;
  p90: number;
  total: number;
}

interface EntityCounts {
  blackHole: number;
  caches: number;
  debris: number;
  neutronStars: number;
  planets: number;
  rockets: number;
  suns: number;
}

interface MessageTypeStats {
  bytes: number[];
  count: number;
  totalBytes: number;
}

interface FullSnapshotStats {
  count: number;
  maxEntities: EntityCounts;
  selfNull: number;
  selfPresent: number;
  totalEntities: EntityCounts;
}

interface DeltaSnapshotStats {
  count: number;
  maxChanged: EntityCounts;
  maxRemoved: EntityCounts;
  selfNull: number;
  selfOmitted: number;
  selfPresent: number;
  totalChanged: EntityCounts;
  totalRemoved: EntityCounts;
}

interface SnapshotV2Stats {
  count: number;
  maxRemoved: EntityCounts;
  maxSpawns: EntityCounts;
  maxUpdates: EntityCounts;
  selfNull: number;
  selfOmitted: number;
  selfPresent: number;
  totalRemoved: EntityCounts;
  totalSpawns: EntityCounts;
  totalUpdates: EntityCounts;
}

export interface OutboundProtocolTelemetrySummary {
  elapsedMs: number;
  fullSnapshot?: {
    avgEntities: EntityCounts;
    count: number;
    maxEntities: EntityCounts;
    selfNull: number;
    selfPresent: number;
  };
  messageTypes: Partial<Record<MessageType, ByteStats>>;
  deltaSnapshot?: {
    avgChanged: EntityCounts;
    avgRemoved: EntityCounts;
    count: number;
    maxChanged: EntityCounts;
    maxRemoved: EntityCounts;
    selfNull: number;
    selfOmitted: number;
    selfPresent: number;
  };
  snapshotV2?: {
    avgRemoved: EntityCounts;
    avgSpawns: EntityCounts;
    avgUpdates: EntityCounts;
    count: number;
    maxRemoved: EntityCounts;
    maxSpawns: EntityCounts;
    maxUpdates: EntityCounts;
    selfNull: number;
    selfOmitted: number;
    selfPresent: number;
  };
}

const ENTITY_KEYS = [
  "suns",
  "neutronStars",
  "planets",
  "rockets",
  "caches",
  "debris",
  "blackHole",
] as const satisfies readonly (keyof EntityCounts)[];

const createEntityCounts = (): EntityCounts => ({
  blackHole: 0,
  caches: 0,
  debris: 0,
  neutronStars: 0,
  planets: 0,
  rockets: 0,
  suns: 0,
});

const addCounts = (target: EntityCounts, source: EntityCounts): void => {
  for (const key of ENTITY_KEYS) {
    target[key] += source[key];
  }
};

const maxCounts = (target: EntityCounts, source: EntityCounts): void => {
  for (const key of ENTITY_KEYS) {
    target[key] = Math.max(target[key], source[key]);
  }
};

const averageCounts = (total: EntityCounts, count: number): EntityCounts => {
  if (count <= 0) {
    return createEntityCounts();
  }

  const average = createEntityCounts();
  for (const key of ENTITY_KEYS) {
    average[key] = Math.round((total[key] / count) * 100) / 100;
  }
  return average;
};

const summarizeBytes = (
  samples: readonly number[],
  totalBytes: number,
): ByteStats | null => {
  if (samples.length === 0) {
    return null;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (value: number): number =>
    sorted[
      Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))
    ] ?? 0;

  return {
    avg: Math.round(totalBytes / samples.length),
    count: samples.length,
    max: sorted[sorted.length - 1] ?? 0,
    min: sorted[0] ?? 0,
    p50: percentile(0.5),
    p90: percentile(0.9),
    total: totalBytes,
  };
};

const fullSnapshotCounts = (message: FullSnapshotMsg): EntityCounts => ({
  blackHole: message.world.blackHole === undefined ? 0 : 1,
  caches: message.world.caches.length,
  debris: message.world.debris.length,
  neutronStars: message.world.neutronStars.length,
  planets: message.world.planets.length,
  rockets: message.world.rockets.length,
  suns: message.world.suns.length,
});

const deltaChangedCounts = (message: DeltaSnapshotMsg): EntityCounts => ({
  blackHole: message.changed.blackHole === undefined ? 0 : 1,
  caches: message.changed.caches?.length ?? 0,
  debris: message.changed.debris?.length ?? 0,
  neutronStars: message.changed.neutronStars?.length ?? 0,
  planets: message.changed.planets?.length ?? 0,
  rockets: message.changed.rockets?.length ?? 0,
  suns: message.changed.suns?.length ?? 0,
});

const deltaRemovedCounts = (message: DeltaSnapshotMsg): EntityCounts => ({
  blackHole: message.removed.blackHole === true ? 1 : 0,
  caches: message.removed.caches?.length ?? 0,
  debris: message.removed.debris?.length ?? 0,
  neutronStars: message.removed.neutronStars?.length ?? 0,
  planets: message.removed.planets?.length ?? 0,
  rockets: message.removed.rockets?.length ?? 0,
  suns: message.removed.suns?.length ?? 0,
});

const snapshotV2SpawnCounts = (message: SnapshotV2Msg): EntityCounts => ({
  blackHole: message.spawns.blackHole === undefined ? 0 : 1,
  caches: message.spawns.caches?.length ?? 0,
  debris: message.spawns.debris?.length ?? 0,
  neutronStars: message.spawns.neutronStars?.length ?? 0,
  planets: message.spawns.planets?.length ?? 0,
  rockets: message.spawns.rockets?.length ?? 0,
  suns: message.spawns.suns?.length ?? 0,
});

const snapshotV2UpdateCounts = (message: SnapshotV2Msg): EntityCounts => ({
  blackHole: message.updates.blackHole === undefined ? 0 : 1,
  caches: message.updates.caches?.length ?? 0,
  debris: message.updates.debris?.length ?? 0,
  neutronStars: message.updates.neutronStars?.length ?? 0,
  planets: message.updates.planets?.length ?? 0,
  rockets: message.updates.rockets?.length ?? 0,
  suns: message.updates.suns?.length ?? 0,
});

const snapshotV2RemovedCounts = (message: SnapshotV2Msg): EntityCounts => ({
  blackHole: message.removed.blackHole === true ? 1 : 0,
  caches: message.removed.caches?.length ?? 0,
  debris: message.removed.debris?.length ?? 0,
  neutronStars: message.removed.neutronStars?.length ?? 0,
  planets: message.removed.planets?.length ?? 0,
  rockets: message.removed.rockets?.length ?? 0,
  suns: message.removed.suns?.length ?? 0,
});

const createFullSnapshotStats = (): FullSnapshotStats => ({
  count: 0,
  maxEntities: createEntityCounts(),
  selfNull: 0,
  selfPresent: 0,
  totalEntities: createEntityCounts(),
});

const createDeltaSnapshotStats = (): DeltaSnapshotStats => ({
  count: 0,
  maxChanged: createEntityCounts(),
  maxRemoved: createEntityCounts(),
  selfNull: 0,
  selfOmitted: 0,
  selfPresent: 0,
  totalChanged: createEntityCounts(),
  totalRemoved: createEntityCounts(),
});

const createSnapshotV2Stats = (): SnapshotV2Stats => ({
  count: 0,
  maxRemoved: createEntityCounts(),
  maxSpawns: createEntityCounts(),
  maxUpdates: createEntityCounts(),
  selfNull: 0,
  selfOmitted: 0,
  selfPresent: 0,
  totalRemoved: createEntityCounts(),
  totalSpawns: createEntityCounts(),
  totalUpdates: createEntityCounts(),
});

const createMessageTypeStats = (): MessageTypeStats => ({
  bytes: [],
  count: 0,
  totalBytes: 0,
});

export class OutboundProtocolTelemetry {
  #deltaSnapshot = createDeltaSnapshotStats();
  #fullSnapshot = createFullSnapshotStats();
  #messageTypes = new Map<MessageType, MessageTypeStats>();
  #snapshotV2 = createSnapshotV2Stats();
  #startedAtMs = Date.now();

  record(message: ServerMsg, byteLength: number): void {
    const messageStats =
      this.#messageTypes.get(message.type) ?? createMessageTypeStats();
    messageStats.bytes.push(byteLength);
    messageStats.count += 1;
    messageStats.totalBytes += byteLength;
    this.#messageTypes.set(message.type, messageStats);

    switch (message.type) {
      case "fullSnapshot":
        this.recordFullSnapshot(message);
        break;
      case "deltaSnapshot":
        this.recordDeltaSnapshot(message);
        break;
      case "snapshotV2":
        this.recordSnapshotV2(message);
        break;
    }
  }

  flush(nowMs = Date.now()): OutboundProtocolTelemetrySummary | null {
    const messageTypes: Partial<Record<MessageType, ByteStats>> = {};
    let totalMessages = 0;

    for (const [type, stats] of this.#messageTypes) {
      const byteStats = summarizeBytes(stats.bytes, stats.totalBytes);
      if (byteStats === null) {
        continue;
      }
      messageTypes[type] = byteStats;
      totalMessages += stats.count;
    }

    if (totalMessages === 0) {
      this.#startedAtMs = nowMs;
      return null;
    }

    const elapsedMs = nowMs - this.#startedAtMs;
    const summary: OutboundProtocolTelemetrySummary = {
      elapsedMs,
      messageTypes,
      ...(this.#fullSnapshot.count === 0
        ? {}
        : {
            fullSnapshot: {
              avgEntities: averageCounts(
                this.#fullSnapshot.totalEntities,
                this.#fullSnapshot.count,
              ),
              count: this.#fullSnapshot.count,
              maxEntities: { ...this.#fullSnapshot.maxEntities },
              selfNull: this.#fullSnapshot.selfNull,
              selfPresent: this.#fullSnapshot.selfPresent,
            },
          }),
      ...(this.#deltaSnapshot.count === 0
        ? {}
        : {
            deltaSnapshot: {
              avgChanged: averageCounts(
                this.#deltaSnapshot.totalChanged,
                this.#deltaSnapshot.count,
              ),
              avgRemoved: averageCounts(
                this.#deltaSnapshot.totalRemoved,
                this.#deltaSnapshot.count,
              ),
              count: this.#deltaSnapshot.count,
              maxChanged: { ...this.#deltaSnapshot.maxChanged },
              maxRemoved: { ...this.#deltaSnapshot.maxRemoved },
              selfNull: this.#deltaSnapshot.selfNull,
              selfOmitted: this.#deltaSnapshot.selfOmitted,
              selfPresent: this.#deltaSnapshot.selfPresent,
            },
          }),
      ...(this.#snapshotV2.count === 0
        ? {}
        : {
            snapshotV2: {
              avgRemoved: averageCounts(
                this.#snapshotV2.totalRemoved,
                this.#snapshotV2.count,
              ),
              avgSpawns: averageCounts(
                this.#snapshotV2.totalSpawns,
                this.#snapshotV2.count,
              ),
              avgUpdates: averageCounts(
                this.#snapshotV2.totalUpdates,
                this.#snapshotV2.count,
              ),
              count: this.#snapshotV2.count,
              maxRemoved: { ...this.#snapshotV2.maxRemoved },
              maxSpawns: { ...this.#snapshotV2.maxSpawns },
              maxUpdates: { ...this.#snapshotV2.maxUpdates },
              selfNull: this.#snapshotV2.selfNull,
              selfOmitted: this.#snapshotV2.selfOmitted,
              selfPresent: this.#snapshotV2.selfPresent,
            },
          }),
    };

    this.reset(nowMs);
    return summary;
  }

  private recordFullSnapshot(message: FullSnapshotMsg): void {
    const counts = fullSnapshotCounts(message);
    this.#fullSnapshot.count += 1;
    addCounts(this.#fullSnapshot.totalEntities, counts);
    maxCounts(this.#fullSnapshot.maxEntities, counts);
    if (message.self === null) {
      this.#fullSnapshot.selfNull += 1;
    } else {
      this.#fullSnapshot.selfPresent += 1;
    }
  }

  private recordDeltaSnapshot(message: DeltaSnapshotMsg): void {
    const changed = deltaChangedCounts(message);
    const removed = deltaRemovedCounts(message);
    this.#deltaSnapshot.count += 1;
    addCounts(this.#deltaSnapshot.totalChanged, changed);
    addCounts(this.#deltaSnapshot.totalRemoved, removed);
    maxCounts(this.#deltaSnapshot.maxChanged, changed);
    maxCounts(this.#deltaSnapshot.maxRemoved, removed);

    if (!("self" in message)) {
      this.#deltaSnapshot.selfOmitted += 1;
    } else if (message.self === null) {
      this.#deltaSnapshot.selfNull += 1;
    } else {
      this.#deltaSnapshot.selfPresent += 1;
    }
  }

  private recordSnapshotV2(message: SnapshotV2Msg): void {
    const spawns = snapshotV2SpawnCounts(message);
    const updates = snapshotV2UpdateCounts(message);
    const removed = snapshotV2RemovedCounts(message);
    this.#snapshotV2.count += 1;
    addCounts(this.#snapshotV2.totalSpawns, spawns);
    addCounts(this.#snapshotV2.totalUpdates, updates);
    addCounts(this.#snapshotV2.totalRemoved, removed);
    maxCounts(this.#snapshotV2.maxSpawns, spawns);
    maxCounts(this.#snapshotV2.maxUpdates, updates);
    maxCounts(this.#snapshotV2.maxRemoved, removed);

    if (!("self" in message)) {
      this.#snapshotV2.selfOmitted += 1;
    } else if (message.self === null) {
      this.#snapshotV2.selfNull += 1;
    } else {
      this.#snapshotV2.selfPresent += 1;
    }
  }

  private reset(nowMs: number): void {
    this.#deltaSnapshot = createDeltaSnapshotStats();
    this.#fullSnapshot = createFullSnapshotStats();
    this.#messageTypes.clear();
    this.#snapshotV2 = createSnapshotV2Stats();
    this.#startedAtMs = nowMs;
  }
}
