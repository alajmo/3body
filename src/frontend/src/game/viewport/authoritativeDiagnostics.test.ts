import { describe, expect, it } from "vitest";
import {
  createAuthoritativeNetworkDiagnostics,
  getSocketPayloadByteLength,
} from "./authoritativeDiagnostics";

describe("createAuthoritativeNetworkDiagnostics", () => {
  it("tracks byte rates, message rates, and snapshot gaps over a rolling window", () => {
    const diagnostics = createAuthoritativeNetworkDiagnostics(2000);
    diagnostics.reset(0);

    diagnostics.recordInbound("fullSnapshot", 1000, 0);
    diagnostics.recordSnapshot("fullSnapshot", 10, 0, 1000);
    diagnostics.recordOutbound("ackSnapshot", 20, 1);
    diagnostics.recordInbound("snapshotV2", 500, 16);
    diagnostics.recordSnapshot("snapshotV2", 11, 16, 1016);
    diagnostics.recordInbound("snapshotV2", 500, 50);
    diagnostics.recordSnapshot("snapshotV2", 13, 50, 1050);

    const snapshot = diagnostics.getSnapshot(2000);

    expect(snapshot.inboundBytesPerSec).toBe(1000);
    expect(snapshot.inboundMessagesPerSec).toBe(1.5);
    expect(snapshot.outboundBytesPerSec).toBe(10);
    expect(snapshot.snapshotMessagesPerSec).toBe(1.5);
    expect(snapshot.snapshotGapAverageMs).toBe(25);
    expect(snapshot.snapshotGapP90Ms).toBe(34);
    expect(snapshot.snapshotGapMaxMs).toBe(34);
    expect(snapshot.snapshotGapOver50Count).toBe(0);
    expect(snapshot.snapshotGapOver100Count).toBe(0);
    expect(snapshot.snapshotLateCount).toBe(1);
    expect(snapshot.serverSnapshotGapAverageMs).toBe(25);
    expect(snapshot.serverSnapshotGapP90Ms).toBe(34);
    expect(snapshot.serverSnapshotGapMaxMs).toBe(34);
    expect(snapshot.serverSnapshotLateCount).toBe(1);
    expect(snapshot.snapshotTickGapMax).toBe(2);
    expect(snapshot.inboundByType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bytesPerSec: 500,
          messagesPerSec: 1,
          type: "snapshotV2",
        }),
      ]),
    );
    expect(snapshot.outboundByType).toEqual([
      {
        bytesPerSec: 10,
        messagesPerSec: 0.5,
        type: "ackSnapshot",
      },
    ]);
  });

  it("tracks large client receive gap spikes separately from normal late packets", () => {
    const diagnostics = createAuthoritativeNetworkDiagnostics(2000);
    diagnostics.reset(0);

    diagnostics.recordSnapshot("snapshotV2", 1, 0, 1000);
    diagnostics.recordSnapshot("snapshotV2", 2, 60, 1016);
    diagnostics.recordSnapshot("snapshotV2", 3, 190, 1032);

    const snapshot = diagnostics.getSnapshot(250);

    expect(snapshot.snapshotGapOver50Count).toBe(2);
    expect(snapshot.snapshotGapOver100Count).toBe(1);
    expect(snapshot.snapshotLastGapOver50AgeMs).toBe(60);
    expect(snapshot.snapshotLastGapOver100AgeMs).toBe(60);
  });

  it("prunes samples outside the diagnostics window", () => {
    const diagnostics = createAuthoritativeNetworkDiagnostics(1000);
    diagnostics.reset(0);

    diagnostics.recordInbound("snapshotV2", 100, 0);
    diagnostics.recordInbound("snapshotV2", 300, 1500);

    const snapshot = diagnostics.getSnapshot(2000);

    expect(snapshot.inboundBytesPerSec).toBe(300);
    expect(snapshot.inboundMessagesPerSec).toBe(1);
  });
});

describe("getSocketPayloadByteLength", () => {
  it("measures string and binary socket payloads", () => {
    expect(getSocketPayloadByteLength("abc")).toBe(3);
    expect(getSocketPayloadByteLength(new Uint8Array([1, 2, 3, 4]))).toBe(4);
    expect(getSocketPayloadByteLength(new ArrayBuffer(6))).toBe(6);
  });
});
