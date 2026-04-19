# AI Mode Plan

## Objective

Replace the current reactive bot with a deterministic, production-grade combat AI shared by sandbox and backend.

The target bot should:

- look intentional from the spectator camera
- reposition instead of drifting passively
- fire based on shot quality, not only reload availability
- manage ammo, cooldowns, and abilities deliberately
- contest resources when it is tactically correct
- expose enough debug state to tune safely

## Current Baseline

Current logic lives in:

- `src/shared/src/bot.ts`
- `src/frontend/src/game/combatSandbox.ts`

What works today:

- predictive aim against orbital motion
- basic target selection
- basic shield timing
- basic hazard checks near suns, neutron stars, black hole, and boundary
- basic weapon choice by target chaos and kill threshold

What is missing:

- explicit repositioning
- shot gating
- ammo discipline
- resource play
- drone policy
- wildcard policy
- durable tactical memory
- debug visibility

## Target Architecture

Use a hybrid model:

- utility AI chooses tactical intent
- short-horizon simulation scores future outcomes
- a small execution FSM stabilizes local behavior and interrupts
- a shared blackboard carries facts, intent, plan, history, and debug state

This is intentionally not a single if/else decision function and not a giant FSM.

## Layer Contract

| Layer | Output | Rate | Responsibility |
| --- | --- | --- | --- |
| Threat Probe | `CombatAiThreatProbe` | every tick | detect lethal or urgent interrupts |
| Perception | `CombatAiPerception` | every 6 ticks | derive stable world facts; no decisions |
| Intent | `CombatAiIntent` | every 12 ticks or on lethal interrupt | rank and choose the dominant tactical goal |
| Planner | `CombatAiPlan` | every 4 ticks or on invalidation | build movement, aim, fire, and ability policy |
| Execution FSM | `CombatAiExecutionState` | every tick | keep behavior stable and enforce transition rules |
| Command Emitter | game commands | every tick | emit legal commands from the current plan only |

Rules:

- perception writes facts
- intent chooses priority
- planner builds a short plan
- execution FSM owns local mode and preemption
- command emission never invents new strategy

## Blackboard

Each bot gets one blackboard. It is the single source of truth for AI state.

Required contents:

- self snapshot
- perception snapshot
- ranked intent scores
- active intent
- active plan
- execution state
- recent threats and outcomes
- cooldown windows
- deterministic RNG state
- debug reasons and score breakdowns

Ownership:

- perception updates facts
- intent writes `activeIntent` and alternatives
- planner writes `activePlan`
- execution writes `executionState` and transition reason
- command emission reads only

## Execution FSM

The FSM is small by design. It should stabilize behavior, not own strategy.

States:

- `planetCombat`
- `evade`
- `reposition`
- `cacheRun`
- `finishWindow`
- `droneRun`
- `wildcardSetup`
- `recover`

FSM rules:

- state comes from the current plan
- transitions require a reason string
- transitions record `from`, `to`, `tick`, and `reason`
- the FSM may reject a command that violates the active state
- strategic scoring never lives inside the FSM

## Interrupt Policy

Immediate interrupts:

- lethal rocket window
- imminent sun or neutron-star collision
- boundary escape threshold crossed
- black-hole kill-radius breach forecast
- active target destroyed
- active cache race invalidated

Soft interrupts:

- stronger finish window opens
- better cache contest opens
- current firing lane collapses
- current plan loses expected value

Rules:

- immediate interrupts may preempt on the same tick
- soft interrupts may preempt only on planner refresh boundaries
- every preemption is logged to debug state
- command emission cannot bypass interrupt policy

## Data Contracts

Use explicit contracts. Do not pass loose ad-hoc objects between layers.

```ts
interface CombatAiBlackboard {
  self: CombatAiSelfState;
  perception: CombatAiPerception;
  intent: CombatAiIntent;
  intentAlternatives: CombatAiIntentScore[];
  plan: CombatAiPlan | null;
  execution: CombatAiExecutionState;
  history: CombatAiHistory;
  debug: CombatAiDebugState;
  rngState: number;
}

interface CombatAiIntent {
  kind:
    | "survive"
    | "reposition"
    | "pressure"
    | "finish"
    | "contestCache"
    | "recover"
    | "zoneWithHeavy"
    | "lockSeeker"
    | "deployDrone"
    | "useWildcard";
  score: number;
  targetPlayerId?: string;
  targetCacheId?: number;
  expiresAtTick: number;
  reason: string;
}

interface CombatAiPlan {
  generatedAtTick: number;
  expiresAtTick: number;
  executionState:
    | "planetCombat"
    | "evade"
    | "reposition"
    | "cacheRun"
    | "finishWindow"
    | "droneRun"
    | "wildcardSetup"
    | "recover";
  moveGoal: CombatAiMoveGoal | null;
  aimGoal: CombatAiAimGoal | null;
  weaponPolicy: CombatAiWeaponPolicy;
  abilityPolicy: CombatAiAbilityPolicy;
  fireGate: CombatAiFireGate;
  abortConditions: CombatAiAbortCondition[];
  reason: string;
}
```

Contract rules:

- perception must be serializable
- intent must always carry `score` and `reason`
- plan must always carry `expiresAtTick`
- plan must always carry `abortConditions`
- execution state must be derivable from the plan
- debug output must be generated from blackboard state, not reconstructed later

## Core Scoring Systems

### 1. Repositioning

This is the biggest missing system.

The AI should:

- choose radial band and spacing deliberately
- avoid boundary pinning
- enter and leave firing windows intentionally
- use boost as a movement commit, not only as panic escape

Implementation:

- sample candidate movement directions
- simulate short futures
- score survival, line-of-fire quality, pressure, and resource access

### 2. Shot Selection

Do not fire only because reload is ready.

Shot score inputs:

- predicted hit probability
- expected damage
- shield likelihood
- overkill waste
- ammo scarcity
- chance of a better near-future window

Minimum fire-gate output:

- `allowFire`
- `confidence`
- `expectedDamage`
- `wasteScore`
- `holdReason`

### 3. Threat Management

Use one unified danger model across:

- incoming rockets
- future sun collisions
- neutron-star pull
- black-hole collapse
- arena-edge pressure
- crossfire exposure

The output is not only "danger yes/no". It must rank threat type, urgency, and preferred response.

### 4. Resource And Ability Play

The AI must understand:

- cache contest value
- drone routing value
- gravity pulse timing
- cloak timing
- foresight setup windows

Resource play should be evaluated against survival and kill windows, not treated as a separate minigame.

## Difficulty Model

Difficulty comes from policy quality, not hidden bonuses.

Easy:

- shorter lookahead
- weaker shot thresholds
- slower replanning
- fewer chained actions

Normal:

- balanced utility weights
- solid resource usage
- occasional multi-step setup

Hard:

- deeper future simulation
- tighter shot gating
- better punish windows
- stronger ability chaining
- tighter survival margins

Avoid:

- hidden damage bonuses
- fake reload advantages
- impossible perception

## Code Layout

Keep AI in shared code so sandbox and backend use the same logic.

- `src/shared/src/ai/types.ts`
- `src/shared/src/ai/blackboard.ts`
- `src/shared/src/ai/perception.ts`
- `src/shared/src/ai/scoring.ts`
- `src/shared/src/ai/intents.ts`
- `src/shared/src/ai/planner.ts`
- `src/shared/src/ai/execution.ts`
- `src/shared/src/ai/commands.ts`
- `src/shared/src/ai/debug.ts`

Migration:

- keep `src/shared/src/bot.ts` as the compatibility entry point first
- introduce `decideCombatAi(...)` behind that entry point
- keep command shapes stable while internals are replaced

## Debug, Test, Metrics

Required debug payload per bot:

- active intent
- ranked alternatives
- current target
- execution state
- movement score breakdown
- shot score breakdown
- threat ranking
- last transition reason
- plan expiry tick

Required tests:

- unit tests for intent, threat, movement, and shot scoring
- deterministic scenario tests for shield, boundary recovery, kill windows, cache races, black-hole escape, and drone routing
- seeded simulation runs across difficulties

Required metrics:

- shots fired and hit rate by weapon
- expected vs actual damage
- boost value
- death causes
- cache contest attempts and wins
- drone deployment outcomes
- wildcard use outcomes

## Rollout

Phase 1: stabilize the current bot

- add blackboard and explicit contracts
- add debug payloads
- add shot gating
- add ammo conservation
- improve boost logic

Exit gate:

- rocket spam is reduced
- heavy and seeker usage looks intentional
- current intent is visible in debug UI

Phase 2: add tactical repositioning

- add intent scoring
- add movement candidate evaluation
- add execution FSM
- add interrupt handling

Exit gate:

- bots stop looking stationary in wide views
- bots reposition before danger is immediate
- fights show spacing behavior

Phase 3: add resource and ability play

- add cache contesting
- add drone routing
- add wildcard policy
- extend foresight usage

Exit gate:

- bots contest resources intentionally
- drone play looks purposeful
- wildcard usage creates visible tactical swings

Phase 4: tune and validate

- tune utility weights
- run seeded evaluation suites
- lock difficulty baselines
- expose tuning and debug tools in the editor

Exit gate:

- hard beats normal consistently
- normal beats easy consistently
- no single exploit dominates matches

## Acceptance Criteria

The system is production-grade when:

- spectators can see clear tactical behavior
- bots can explain what they are doing through debug state
- hard difficulty wins through better decisions, not fake bonuses
- the same AI logic runs in sandbox and backend-authoritative matches
- behavior changes are testable through deterministic fixtures and seeded simulations

## Immediate Next Steps

1. Keep the AI viewport aligned with `readModeWorldHeight` so evaluation is trustworthy.
2. Add `CombatAiBlackboard`, `CombatAiIntent`, and `CombatAiPlan` under shared code.
3. Add AI debug state to the sandbox HUD/controller path.
4. Replace unconditional fire-on-cadence with shot gating.
5. Add repositioning scoring before adding more weapons or abilities.
6. Add deterministic movement and shot-selection scenarios.
