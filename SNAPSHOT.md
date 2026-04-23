# Snapshot Protocol Plan

## Goal

Reduce authoritative match socket bandwidth and client decode work without
changing the authority model.

The root route (`/`) should remain server-authoritative. The client still needs
snapshots, interpolation, and ACKs. What should change is the shape and cadence
of those snapshots.

## Current Status

As of April 23, 2026, `/` uses MessagePack over WebSocket for client and server
messages. Control messages remain object-shaped; V2 combat deltas use compact
array rows for hot-path entity updates.

Phase 1 telemetry is available behind `SNAPSHOT_TELEMETRY_INTERVAL_MS`. Set it
to a positive interval, for example `SNAPSHOT_TELEMETRY_INTERVAL_MS=10000`, to
log periodic `outbound_protocol_telemetry` summaries from the backend.

The root route now requests `snapshotVersion: 2` in `hello`. V2-capable clients
receive compact `snapshotV2` combat deltas; older clients still fall back to the
legacy object-shaped `deltaSnapshot`. The server also replies with JSON text
when the first client message arrives as JSON text, so cached pre-MessagePack
clients have a compatibility path.

Baseline measurement before the cadence reduction, on a representative 7-seat
room with 3 suns, 1 neutron star, 7 planets, 12 caches, and 60 Hz snapshots:

| Message | Old JSON payload | MessagePack payload |
| --- | ---: | ---: |
| `fullSnapshot` | 5.5 KB | 3.4 KB |
| `deltaSnapshot` | 5.1-7.0 KB, avg 6.1 KB | 3.1-4.3 KB, avg 3.8 KB |
| `input` | 69 B | 58 B |
| `ackSnapshot` | 33 B | 25 B |
| `hello` | 119 B | 96 B |

At 60 snapshots/sec, the same object-shaped delta stream averaged about 366
KB/sec per client as JSON. With MessagePack encoding, the measured delta payload
was about 225 KB/sec per client. A 30 Hz test dropped bandwidth further, but
made the authoritative route feel laggier because visual confirmation arrived
every 33 ms instead of every 16 ms. The default was restored to 60 Hz while
keeping compact `snapshotV2`. With V2, the expected 60 Hz stream is roughly
74-86 KB/sec per client for the measured scenario. These figures count only
snapshot payload bytes, before WebSocket/TCP/IP framing and without gameplay
spikes from rockets, debris, or extra events.

## What Is Necessary

The authoritative route needs:

- One bootstrap snapshot that gives the client enough state to construct the
  world.
- Regular authoritative updates for dynamic state so the client can interpolate.
- Spawn and despawn information for entities that appear or disappear.
- Private player state updates for ammo, cooldowns, boost charges, and held
  abilities.
- Snapshot ACKs so the server knows what base tick each client can delta from.

The authoritative route does not need:

- Full object-shaped moving entities in every delta.
- Static fields repeated at 60 Hz.
- Property names repeated for every entity in every hot-path snapshot.
- A 60 Hz object-shaped snapshot stream; 60 Hz stays, but payload shape must be
  compact.

## Current Problem

The current `deltaSnapshot` is structurally a delta, but it often behaves like a
full-ish moving-world update.

`buildRoomDeltaSnapshot()` compares entities by object identity. Many simulation
steps create new entity objects for moving bodies, so any moved entity is sent as
a full object. That means repeated fields like `kind`, `radius`, `mass`,
`playerId`, `archetype`, `contents`, and long property names are sent again and
again.

MessagePack reduces the byte count, but it does not fix the shape problem.

## Target Model

Split snapshot data into stable state and dynamic state.

Stable state is sent on bootstrap or spawn:

- Entity id.
- Entity kind.
- Radius.
- Mass for suns, neutron stars, and black holes.
- Cache contents.
- Planet owner and archetype.
- Rocket owner, rocket kind, target id, and TTL.
- Arena radius and orbit pattern metadata.

Dynamic state is sent repeatedly:

- Entity id.
- Position.
- Velocity.
- Planet HP.
- Planet shield aim, active flag, and load.
- Planet debuffs when present.
- Black hole growth values while active.
- Rocket position, velocity, and remaining TTL if needed for interpolation.

Private `self` state is sent only when changed:

- Ammo.
- Cooldowns.
- Boost charges.
- Gravity pulse held flag.
- Shield extension flag.

## Proposed Protocol Shape

Keep the current object protocol for control messages. Optimize only hot-path
snapshot messages first.

Example target shape:

```ts
type CompactSnapshot = {
  type: "snapshotV2";
  tick: number;
  baseTick?: number;
  full?: CompactFullState;
  spawns?: CompactSpawnSet;
  updates?: CompactUpdateSet;
  removed?: CompactRemovedSet;
  self?: CompactSelfState | null;
};
```

Use arrays for hot-path entity updates to avoid repeated property names:

```ts
type PlanetUpdateRow = [
  id: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  hp: number,
  shieldX: number,
  shieldY: number,
  shieldActive: 0 | 1,
  shieldLoad: number,
];

type RocketUpdateRow = [
  id: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  ttlUntilTick: number,
];
```

Do not convert the whole protocol to numeric tags in the first pass. Numeric
tags are smaller, but they make debugging and compatibility harder. MessagePack
plus compact arrays should be enough for the first major reduction.

## Migration Plan

### Phase 1: Instrumentation

- [x] Add byte-size telemetry around server `Connection.send()`.
- [x] Track count, min, p50, p90, max, and average by message type.
- [x] Track snapshot composition: planets, rockets, caches, debris, changed
  counts, removed counts, and whether `self` was included.
- [x] Keep telemetry disabled by default and enabled only with
  `SNAPSHOT_TELEMETRY_INTERVAL_MS`.

### Phase 2: Snapshot Cadence

- [x] Test lowering `SNAPSHOT_HZ` from 60 to 30 for authoritative matches.
- [x] Verify interpolation quality, input feel, rocket impacts, shield feel, and
  camera behavior. Result: 30 Hz felt laggier, so the default is back to 60 Hz.
- [x] Keep simulation, snapshots, and input cadence aligned at 60 Hz.
- [x] Keep 60 Hz as the default now that `snapshotV2` reduces payload size.

### Phase 3: Real Deltas

- [x] Replace hot-path object-identity delta broadcasts with compact
  field-aware `snapshotV2` deltas for V2-capable clients.
- [x] Only include dynamic fields that changed or are required for
  interpolation.
- [x] Keep stable entity data out of repeated V2 updates.
- [x] Preserve current `fullSnapshot` fallback when the client ACK base tick is
  no longer available.

### Phase 4: Compact Snapshot V2

- [x] Add `snapshotV2` alongside the current `fullSnapshot` and
  `deltaSnapshot`.
- [x] Encode hot-path entity updates as compact arrays.
- [x] Keep control messages object-shaped.
- [x] Add shared protocol types so frontend and backend share the same wire
  shape.
- [x] Gate V2 behind a negotiated `snapshotVersion: 2` capability in `hello`.

### Phase 5: Spawn/Despawn Stream

- [x] Send stable entity fields only on initial full state or V2 spawn.
- [x] Send despawns as ids grouped by entity type.
- [x] Treat rocket launches, cache respawns, debris creation, black-hole spawn,
  and black-hole removal as explicit V2 snapshot changes.
- [x] Keep cosmetic event messages separate from authoritative entity state
  unless a visual event is required to reconstruct state.

### Phase 6: Cleanup

- Remove the old snapshot path after V2 has test coverage and soak time.
- Delete compatibility fallback code that is no longer needed.
- Update any profiling scripts to report V2 snapshot sizes.

## Validation

Each phase should include:

- `npm run typecheck`
- `npm run test:frontend`
- Targeted tests for snapshot encode/decode and delta application.
- A local `/` playtest with rockets, shields, abilities, black-hole spawn, cache
  pickups, reconnect, and spectator mode.
- Byte-size comparison against the current MessagePack object protocol.

Success criteria for the first full pass:

- Average authoritative delta payload below 1.5 KB per client at 60 Hz.
- No visible interpolation regression in normal movement.
- No delayed or wrong-side rocket hit feedback.
- Reconnect and full snapshot fallback still work.

## Non-Goals

- Do not make the client authoritative.
- Do not move rendering to the backend.
- Do not rewrite all socket messages into numeric-tag binary packets upfront.
- Do not remove snapshot ACKs.
- Do not optimize chat, lobby, pick, or rematch messages before combat
  snapshots.

## Open Questions

- Should the 60 Hz stream stay fixed, or should low-bandwidth rooms negotiate a
  lower cadence with a larger interpolation buffer?
- Should planets always send velocity, or can the client derive it from
  positions for some updates?
- Should rocket TTL be repeated every update, or only sent on spawn and removed
  on despawn/expiry?
- Should `self` state continue to be signature-based, or should it become a
  compact field-level delta too?
- Should snapshot size telemetry be exposed in the HUD profiler or only logged
  server-side?
