import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  cloneGameTuningDocument,
  sanitizeGameTuning,
  type GameTuningDocument,
  type RocketKind,
} from "@3body/shared";
import {
  startTransition,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  EditorPreviewStage,
  type EditorPreviewStageMode,
} from "./EditorPreviewStage";
import {
  applyRuntimeTuningDocument,
  getRuntimeTuningDocument,
} from "./game/runtimeTuning";

type EditorItemId =
  | "overview"
  | "hud"
  | "orbits"
  | "planets"
  | "suns"
  | "blackHole"
  | "rocketLight"
  | "rocketHeavy"
  | "rocketSeeker"
  | "foresight"
  | "shield"
  | "boost"
  | "drone"
  | "cache";

type EditorItemMeta = {
  id: EditorItemId;
  label: string;
  note: string;
};

const EDITOR_VIEW_ITEMS = [
  { id: "overview", label: "Overview", note: "Showcase + HUD" },
  { id: "hud", label: "HUD", note: "HUD only" },
  { id: "orbits", label: "Orbits", note: "HUD + suns rotating" },
] as const;

const EDITOR_GROUPS = [
  {
    label: "World",
    items: [
      { id: "planets", label: "Planets", note: "Scale and archetype colors" },
      { id: "suns", label: "Suns", note: "Glow and warp" },
      { id: "blackHole", label: "Black Hole", note: "Gameplay and visuals" },
      { id: "cache", label: "Caches", note: "Spawn and badge size" },
    ],
  },
  {
    label: "Missiles",
    items: [
      { id: "rocketLight", label: "Light", note: "Ammo, reload, look" },
      { id: "rocketHeavy", label: "Heavy", note: "Damage and silhouette" },
      { id: "rocketSeeker", label: "Seeker", note: "Lock-on profile" },
    ],
  },
  {
    label: "Abilities",
    items: [
      { id: "foresight", label: "Foresight", note: "Cooldown and accent" },
      { id: "shield", label: "Shield", note: "Arc and active tint" },
      { id: "boost", label: "Boost", note: "Charges and impulse" },
      { id: "drone", label: "Drone", note: "Flight and color states" },
    ],
  },
] as const satisfies readonly {
  label: string;
  items: readonly EditorItemMeta[];
}[];

const ROCKET_KIND_BY_ITEM: Record<
  Extract<EditorItemId, "rocketLight" | "rocketHeavy" | "rocketSeeker">,
  RocketKind
> = {
  rocketLight: "light",
  rocketHeavy: "heavy",
  rocketSeeker: "seeker",
};

const getEditorItemMeta = (itemId: EditorItemId): EditorItemMeta | null => {
  const previewItem = (EDITOR_VIEW_ITEMS as readonly EditorItemMeta[]).find(
    (item) => item.id === itemId,
  );
  if (previewItem !== undefined) {
    return previewItem;
  }

  for (const group of EDITOR_GROUPS as readonly {
    label: string;
    items: readonly EditorItemMeta[];
  }[]) {
    const found = group.items.find((item) => item.id === itemId);
    if (found !== undefined) {
      return found;
    }
  }

  return null;
};

const createDocumentSnapshot = () =>
  cloneGameTuningDocument(getRuntimeTuningDocument());

const getPreviewMode = (
  itemId: EditorItemId,
): {
  kind: "editorStage";
  label: string;
  mode: EditorPreviewStageMode;
  showHud: boolean;
} => {
  switch (itemId) {
    case "overview":
      return {
        kind: "editorStage",
        label: "Overview preview",
        mode: { kind: "showcase", focus: "all" },
        showHud: true,
      };
    case "hud":
      return {
        kind: "editorStage",
        label: "HUD overlay preview",
        mode: { kind: "blank" },
        showHud: true,
      };
    case "orbits":
      return {
        kind: "editorStage",
        label: "Orbit sandbox preview",
        mode: { kind: "orbits" },
        showHud: true,
      };
    case "planets":
      return {
        kind: "editorStage",
        label: "Focused planet showcase",
        mode: { kind: "showcase", focus: "planets" },
        showHud: false,
      };
    case "suns":
      return {
        kind: "editorStage",
        label: "Focused sun showcase",
        mode: { kind: "showcase", focus: "suns" },
        showHud: false,
      };
    case "blackHole":
      return {
        kind: "editorStage",
        label: "Focused black hole preview",
        mode: { kind: "blackHole" },
        showHud: false,
      };
    case "cache":
      return {
        kind: "editorStage",
        label: "Focused cache showcase",
        mode: { kind: "showcase", focus: "caches" },
        showHud: false,
      };
    case "rocketLight":
      return {
        kind: "editorStage",
        label: "Focused light missile showcase",
        mode: { kind: "showcase", focus: "rockets", rocketKind: "light" },
        showHud: false,
      };
    case "rocketHeavy":
      return {
        kind: "editorStage",
        label: "Focused heavy missile showcase",
        mode: { kind: "showcase", focus: "rockets", rocketKind: "heavy" },
        showHud: false,
      };
    case "rocketSeeker":
      return {
        kind: "editorStage",
        label: "Focused seeker missile showcase",
        mode: { kind: "showcase", focus: "rockets", rocketKind: "seeker" },
        showHud: false,
      };
    case "foresight":
      return {
        kind: "editorStage",
        label: "Focused foresight preview",
        mode: { kind: "foresight" },
        showHud: false,
      };
    case "shield":
      return {
        kind: "editorStage",
        label: "Focused shield preview",
        mode: { kind: "shield" },
        showHud: false,
      };
    case "boost":
      return {
        kind: "editorStage",
        label: "Focused boost preview",
        mode: { kind: "boost" },
        showHud: false,
      };
    case "drone":
      return {
        kind: "editorStage",
        label: "Focused drone preview",
        mode: { kind: "drone" },
        showHud: false,
      };
    default:
      return {
        kind: "editorStage",
        label: "Preview unavailable",
        mode: { kind: "blank" },
        showHud: false,
      };
  }
};

const describeSaveState = (
  status: "idle" | "loading" | "saving" | "saved" | "error",
): string => {
  switch (status) {
    case "loading":
      return "Loading tuning document";
    case "saving":
      return "Saving tuning document";
    case "saved":
      return "Saved to src/shared/src/tuning/current.json";
    case "error":
      return "Save failed";
    default:
      return "Editing runtime tuning";
  }
};

const updateDocument = (
  source: GameTuningDocument,
  updater: (draft: GameTuningDocument) => void,
): GameTuningDocument => {
  const nextDocument = cloneGameTuningDocument(source);
  updater(nextDocument);
  return nextDocument;
};

function InspectorSection({
  title,
  note,
  children,
}: {
  children: ReactNode;
  note?: string;
  title: string;
}) {
  return (
    <section className="edit-inspector__section">
      <header className="edit-inspector__section-header">
        <div className="edit-inspector__section-title">{title}</div>
        {note ? (
          <div className="edit-inspector__section-note">{note}</div>
        ) : null}
      </header>
      <div className="edit-inspector__field-grid">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  max,
  min,
  onCommit,
  onPreviewChange,
  step,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  onPreviewChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState(value.toString());

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  const commit = () => {
    const nextValue = Number(draft);
    if (!Number.isFinite(nextValue)) {
      setDraft(value.toString());
      return;
    }

    onCommit(nextValue);
  };

  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="number"
        className="edit-field__input"
        min={min}
        max={max}
        step={step}
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          const nextValue = Number(nextDraft);
          if (Number.isFinite(nextValue)) {
            onPreviewChange(nextValue);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  onCommit,
  onPreviewChange,
  value,
}: {
  label: string;
  onCommit: (value: string) => void;
  onPreviewChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="color"
        className="edit-field__input edit-field__input--color"
        value={value}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onChange={(event) => onPreviewChange(event.currentTarget.value)}
      />
    </label>
  );
}

function EditorItemPreview({
  documentValue,
  itemId,
}: {
  documentValue: GameTuningDocument;
  itemId: EditorItemId;
}) {
  switch (itemId) {
    case "overview":
      return (
        <div className="edit-object-preview edit-object-preview--all">
          <span
            className="edit-object-preview__all-planet"
            style={{
              background: documentValue.visuals.planets.archetypes.terra.color,
            }}
          />
          <span className="edit-object-preview__all-sun" />
          <span
            className="edit-object-preview__all-rocket"
            style={{ background: documentValue.visuals.rockets.light.core }}
          />
        </div>
      );
    case "orbits":
      return (
        <div className="edit-object-preview edit-object-preview--orbits">
          <span className="edit-object-preview__orbit-ring" />
          <span className="edit-object-preview__orbit-ring edit-object-preview__orbit-ring--inner" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--a" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--b" />
          <span className="edit-object-preview__orbit-sun edit-object-preview__orbit-sun--c" />
        </div>
      );
    case "planets":
      return (
        <div className="edit-object-preview edit-object-preview--planets">
          {ARCHETYPE_IDS.map((archetype) => (
            <span
              key={archetype}
              className="edit-object-preview__planet"
              style={{
                background:
                  documentValue.visuals.planets.archetypes[archetype].color,
              }}
            />
          ))}
        </div>
      );
    case "suns":
      return (
        <div className="edit-object-preview edit-object-preview--sun">
          <span className="edit-object-preview__sun-core" />
          <span className="edit-object-preview__sun-halo" />
        </div>
      );
    case "blackHole":
      return (
        <div className="edit-object-preview edit-object-preview--black-hole">
          <span className="edit-object-preview__black-hole-ring" />
          <span className="edit-object-preview__black-hole-core" />
        </div>
      );
    case "rocketLight":
    case "rocketHeavy":
    case "rocketSeeker": {
      const rocketKind = ROCKET_KIND_BY_ITEM[itemId];
      const rocket = documentValue.visuals.rockets[rocketKind];
      return (
        <div className="edit-object-preview edit-object-preview--rocket">
          <span
            className="edit-object-preview__rocket-body"
            style={{ background: rocket.core }}
          />
          <span
            className="edit-object-preview__rocket-trail"
            style={{ background: rocket.trail }}
          />
        </div>
      );
    }
    case "foresight":
      return (
        <div
          className="edit-object-preview edit-object-preview--ability"
          style={{ background: documentValue.visuals.abilities.foresightColor }}
        />
      );
    case "shield":
      return (
        <div className="edit-object-preview edit-object-preview--shield">
          <span
            className="edit-object-preview__shield-arc"
            style={{ borderColor: documentValue.visuals.abilities.shieldColor }}
          />
        </div>
      );
    case "boost":
      return (
        <div className="edit-object-preview edit-object-preview--boost">
          <span
            className="edit-object-preview__boost-wave"
            style={{ background: documentValue.visuals.abilities.boostColor }}
          />
        </div>
      );
    case "drone":
      return (
        <div className="edit-object-preview edit-object-preview--drone">
          <span
            className="edit-object-preview__drone-state"
            style={{ background: documentValue.visuals.drone.activeColor }}
          />
          <span
            className="edit-object-preview__drone-state"
            style={{ background: documentValue.visuals.drone.returnColor }}
          />
        </div>
      );
    case "cache":
      return (
        <div className="edit-object-preview edit-object-preview--cache">
          <span className="edit-object-preview__cache-badge">C</span>
        </div>
      );
    case "hud":
      return (
        <div className="edit-object-preview edit-object-preview--hud">
          <span className="edit-object-preview__hud-panel" />
          <span className="edit-object-preview__hud-panel" />
          <span className="edit-object-preview__hud-pill" />
        </div>
      );
  }
}

export function EditPage() {
  const [documentValue, setDocumentValue] = useState(createDocumentSnapshot);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [selectedItemId, setSelectedItemId] =
    useState<EditorItemId>("overview");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "loading" | "saving" | "saved" | "error"
  >("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const documentRef = useRef(documentValue);

  useEffect(() => {
    documentRef.current = documentValue;
  }, [documentValue]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/editor/tuning");
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const nextDocument = sanitizeGameTuning(await response.json());
        if (!active) {
          return;
        }

        applyRuntimeTuningDocument(nextDocument);
        documentRef.current = nextDocument;
        startTransition(() => {
          setDocumentValue(nextDocument);
          setPreviewRevision((current) => current + 1);
          setSaveStatus("idle");
          setSaveError(null);
        });
      } catch (error) {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSaveStatus("error");
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to load tuning document.",
          );
        });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const applyPreviewChange = (updater: (draft: GameTuningDocument) => void) => {
    const nextDocument = updateDocument(documentRef.current, updater);
    documentRef.current = nextDocument;
    setDocumentValue(nextDocument);
  };

  const saveDocument = async (nextDocument: GameTuningDocument) => {
    startTransition(() => {
      setSaveStatus("saving");
      setSaveError(null);
    });

    try {
      const response = await fetch("/api/editor/tuning", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextDocument),
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const savedDocument = sanitizeGameTuning(await response.json());
      applyRuntimeTuningDocument(savedDocument);
      documentRef.current = savedDocument;
      startTransition(() => {
        setDocumentValue(savedDocument);
        setPreviewRevision((current) => current + 1);
        setSaveStatus("saved");
        setSaveError(null);
      });
    } catch (error) {
      startTransition(() => {
        setSaveStatus("error");
        setSaveError(
          error instanceof Error ? error.message : "Unable to save tuning.",
        );
      });
    }
  };

  const commitChange = (updater: (draft: GameTuningDocument) => void) => {
    const nextDocument = updateDocument(documentRef.current, updater);
    documentRef.current = nextDocument;
    setDocumentValue(nextDocument);
    void saveDocument(nextDocument);
  };

  const renderRocketInspector = (rocketKind: RocketKind) => {
    const rocket = documentValue.gameplay.rockets[rocketKind];
    const visuals = documentValue.visuals.rockets[rocketKind];

    return (
      <>
        <InspectorSection title="Gameplay" note="Match rules and ammo flow">
          <NumberField
            label="Damage"
            min={0}
            max={500}
            step={1}
            value={rocket.damage}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].damage = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].damage = value;
              })
            }
          />
          <NumberField
            label="Speed"
            min={10}
            max={4000}
            step={10}
            value={rocket.speed}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].speed = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].speed = value;
              })
            }
          />
          <NumberField
            label="Reload"
            min={0.05}
            max={120}
            step={0.05}
            value={rocket.reloadSec}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].reloadSec = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].reloadSec = value;
              })
            }
          />
          <NumberField
            label="TTL"
            min={0.1}
            max={120}
            step={0.1}
            value={rocket.ttlSec}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].ttlSec = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].ttlSec = value;
              })
            }
          />
          <NumberField
            label="Radius"
            min={1}
            max={128}
            step={1}
            value={rocket.radius}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].radius = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].radius = value;
              })
            }
          />
          <NumberField
            label="Start ammo"
            min={0}
            max={32}
            step={1}
            value={rocket.startAmmo}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].startAmmo = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].startAmmo = value;
              })
            }
          />
          <NumberField
            label="Max ammo"
            min={1}
            max={32}
            step={1}
            value={rocket.maxAmmo}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].maxAmmo = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].maxAmmo = value;
              })
            }
          />
          <NumberField
            label="Turn rate"
            min={0}
            max={25}
            step={0.05}
            value={rocket.turnRate}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.gameplay.rockets[rocketKind].turnRate = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.gameplay.rockets[rocketKind].turnRate = value;
              })
            }
          />
        </InspectorSection>

        <InspectorSection title="Visuals" note="Mesh silhouette and HUD accent">
          <ColorField
            label="Core"
            value={visuals.core}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].core = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].core = value;
              })
            }
          />
          <ColorField
            label="Trail"
            value={visuals.trail}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trail = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trail = value;
              })
            }
          />
          <ColorField
            label="HUD accent"
            value={visuals.hudAccent}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].hudAccent = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].hudAccent = value;
              })
            }
          />
          <NumberField
            label="Body X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.bodyScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.x = value;
              })
            }
          />
          <NumberField
            label="Body Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.bodyScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].bodyScale.y = value;
              })
            }
          />
          <NumberField
            label="Flame X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.flameScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.x = value;
              })
            }
          />
          <NumberField
            label="Flame Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.flameScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].flameScale.y = value;
              })
            }
          />
          <NumberField
            label="Trail X"
            min={1}
            max={256}
            step={0.1}
            value={visuals.trailScale.x}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.x = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.x = value;
              })
            }
          />
          <NumberField
            label="Trail Y"
            min={1}
            max={256}
            step={0.1}
            value={visuals.trailScale.y}
            onPreviewChange={(value) =>
              applyPreviewChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.y = value;
              })
            }
            onCommit={(value) =>
              commitChange((draft) => {
                draft.visuals.rockets[rocketKind].trailScale.y = value;
              })
            }
          />
        </InspectorSection>
      </>
    );
  };

  const renderInspector = () => {
    switch (selectedItemId) {
      case "overview":
        return (
          <InspectorSection
            title="Overview"
            note="Full lineup reference with the HUD layered on top"
          >
            <div className="edit-panel__body">
              Use this to scan planets, suns, rockets, caches, and the HUD
              together before drilling into a specific item.
            </div>
          </InspectorSection>
        );
      case "hud":
        return (
          <>
            <InspectorSection
              title="HUD layout"
              note="Outer placement and widths"
            >
              <NumberField
                label="Top inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.topInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.topInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.topInset = value;
                  })
                }
              />
              <NumberField
                label="Side inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.sideInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.sideInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.sideInset = value;
                  })
                }
              />
              <NumberField
                label="Bottom inset"
                min={0}
                max={120}
                step={1}
                value={documentValue.visuals.hud.bottomInset}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.bottomInset = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.bottomInset = value;
                  })
                }
              />
              <NumberField
                label="Left column width"
                min={180}
                max={520}
                step={1}
                value={documentValue.visuals.hud.leftColumnWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.leftColumnWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.leftColumnWidth = value;
                  })
                }
              />
              <NumberField
                label="Timer width"
                min={120}
                max={480}
                step={1}
                value={documentValue.visuals.hud.timerWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.timerWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.timerWidth = value;
                  })
                }
              />
              <NumberField
                label="Connection width"
                min={120}
                max={480}
                step={1}
                value={documentValue.visuals.hud.connectionWidth}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.connectionWidth = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.connectionWidth = value;
                  })
                }
              />
              <NumberField
                label="Panel gap"
                min={0}
                max={32}
                step={1}
                value={documentValue.visuals.hud.panelGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelGap = value;
                  })
                }
              />
              <NumberField
                label="Dock gap"
                min={0}
                max={32}
                step={1}
                value={documentValue.visuals.hud.dockGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.dockGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.dockGap = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="HUD panels"
              note="Radius and glass treatment"
            >
              <NumberField
                label="Panel radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.panelRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelRadius = value;
                  })
                }
              />
              <NumberField
                label="Pill radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.pillRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.pillRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.pillRadius = value;
                  })
                }
              />
              <NumberField
                label="Card radius"
                min={4}
                max={40}
                step={1}
                value={documentValue.visuals.hud.cardRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.cardRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.cardRadius = value;
                  })
                }
              />
              <NumberField
                label="Compact card radius"
                min={4}
                max={32}
                step={1}
                value={documentValue.visuals.hud.compactCardRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.compactCardRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.compactCardRadius = value;
                  })
                }
              />
              <NumberField
                label="Kill feed radius"
                min={4}
                max={32}
                step={1}
                value={documentValue.visuals.hud.killFeedEntryRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.killFeedEntryRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.killFeedEntryRadius = value;
                  })
                }
              />
              <NumberField
                label="Panel blur"
                min={0}
                max={48}
                step={1}
                value={documentValue.visuals.hud.panelBlurPx}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.hud.panelBlurPx = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.hud.panelBlurPx = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "orbits":
        return (
          <InspectorSection
            title="Orbit preview"
            note="Sun interaction sandbox with the HUD layered on top"
          >
            <div className="edit-panel__body">
              Use this to check orbit motion and HUD composition together while
              the actual sun visual controls stay under <code>Suns</code>.
            </div>
          </InspectorSection>
        );
      case "planets":
        return (
          <>
            <InspectorSection title="Global" note="Shared body and aura tuning">
              <NumberField
                label="Body scale"
                min={0.75}
                max={10}
                step={0.05}
                value={documentValue.visuals.planets.bodyScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.planets.bodyScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.planets.bodyScale = value;
                  })
                }
              />
              <NumberField
                label="Aura scale"
                min={1}
                max={10}
                step={0.05}
                value={documentValue.visuals.planets.auraScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.planets.auraScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.planets.auraScale = value;
                  })
                }
              />
              <NumberField
                label="Aura gap"
                min={0}
                max={10}
                step={0.05}
                value={documentValue.visuals.planets.auraGap}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.planets.auraGap = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.planets.auraGap = value;
                  })
                }
              />
            </InspectorSection>

            {ARCHETYPE_IDS.map((archetype) => {
              const archetypeVisuals =
                documentValue.visuals.planets.archetypes[archetype];

              return (
                <InspectorSection
                  key={archetype}
                  title={ARCHETYPES[archetype].name}
                  note="Planet palette and vegetation texture"
                >
                  <ColorField
                    label="Surface"
                    value={archetypeVisuals.color}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.visuals.planets.archetypes[archetype].color =
                          value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.visuals.planets.archetypes[archetype].color =
                          value;
                      })
                    }
                  />
                  <ColorField
                    label="Trail"
                    value={archetypeVisuals.trailColor}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.visuals.planets.archetypes[archetype].trailColor =
                          value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.visuals.planets.archetypes[archetype].trailColor =
                          value;
                      })
                    }
                  />
                  <ColorField
                    label="Forest"
                    value={archetypeVisuals.forestColor}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.visuals.planets.archetypes[
                          archetype
                        ].forestColor = value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.visuals.planets.archetypes[
                          archetype
                        ].forestColor = value;
                      })
                    }
                  />
                  <NumberField
                    label="Forest density"
                    min={0}
                    max={1}
                    step={0.01}
                    value={archetypeVisuals.forestDensity}
                    onPreviewChange={(value) =>
                      applyPreviewChange((draft) => {
                        draft.visuals.planets.archetypes[
                          archetype
                        ].forestDensity = value;
                      })
                    }
                    onCommit={(value) =>
                      commitChange((draft) => {
                        draft.visuals.planets.archetypes[
                          archetype
                        ].forestDensity = value;
                      })
                    }
                  />
                </InspectorSection>
              );
            })}
          </>
        );
      case "suns":
        return (
          <InspectorSection title="Sun visuals" note="Halation and distortion">
            <NumberField
              label="Glow scale"
              min={0.5}
              max={8}
              step={0.05}
              value={documentValue.visuals.suns.glowScale}
              onPreviewChange={(value) =>
                applyPreviewChange((draft) => {
                  draft.visuals.suns.glowScale = value;
                })
              }
              onCommit={(value) =>
                commitChange((draft) => {
                  draft.visuals.suns.glowScale = value;
                })
              }
            />
            <NumberField
              label="Warp scale"
              min={0.5}
              max={8}
              step={0.05}
              value={documentValue.visuals.suns.warpScale}
              onPreviewChange={(value) =>
                applyPreviewChange((draft) => {
                  draft.visuals.suns.warpScale = value;
                })
              }
              onCommit={(value) =>
                commitChange((draft) => {
                  draft.visuals.suns.warpScale = value;
                })
              }
            />
          </InspectorSection>
        );
      case "blackHole":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Overtime timing and gravity"
            >
              <NumberField
                label="Spawn time"
                min={0}
                max={600}
                step={1}
                value={documentValue.gameplay.blackHole.spawnSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.spawnSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.spawnSec = value;
                  })
                }
              />
              <NumberField
                label="Mass"
                min={0}
                max={50000000}
                step={100000}
                value={documentValue.gameplay.blackHole.mass}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.mass = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.mass = value;
                  })
                }
              />
              <NumberField
                label="Kill radius"
                min={1}
                max={2000}
                step={1}
                value={documentValue.gameplay.blackHole.killRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.killRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.killRadius = value;
                  })
                }
              />
              <NumberField
                label="Ramp"
                min={0.1}
                max={600}
                step={0.1}
                value={documentValue.gameplay.blackHole.rampSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.blackHole.rampSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.blackHole.rampSec = value;
                  })
                }
              />
            </InspectorSection>

            <InspectorSection
              title="Visuals"
              note="Disc, lens, and shock radius"
            >
              <NumberField
                label="Core radius"
                min={20}
                max={1500}
                step={1}
                value={documentValue.visuals.blackHole.coreRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.coreRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.coreRadius = value;
                  })
                }
              />
              <NumberField
                label="Ring radius"
                min={20}
                max={2000}
                step={1}
                value={documentValue.visuals.blackHole.ringRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.ringRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.ringRadius = value;
                  })
                }
              />
              <NumberField
                label="Lens radius"
                min={20}
                max={2500}
                step={1}
                value={documentValue.visuals.blackHole.lensRadius}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.blackHole.lensRadius = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.blackHole.lensRadius = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "rocketLight":
        return renderRocketInspector("light");
      case "rocketHeavy":
        return renderRocketInspector("heavy");
      case "rocketSeeker":
        return renderRocketInspector("seeker");
      case "foresight":
        return (
          <>
            <InspectorSection title="Gameplay" note="Prediction cadence">
              <NumberField
                label="Cooldown"
                min={0}
                max={300}
                step={0.05}
                value={documentValue.gameplay.abilities.foresight.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.foresight.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.foresight.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Duration"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.foresight.durationSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.foresight.durationSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.foresight.durationSec = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Visuals" note="HUD accent">
              <ColorField
                label="Accent"
                value={documentValue.visuals.abilities.foresightColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.foresightColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.foresightColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "shield":
        return (
          <>
            <InspectorSection title="Gameplay" note="Tracking arc and uptime">
              <NumberField
                label="Cooldown"
                min={0}
                max={300}
                step={0.05}
                value={documentValue.gameplay.abilities.shield.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Duration"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.shield.durationSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.durationSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.durationSec = value;
                  })
                }
              />
              <NumberField
                label="Arc"
                min={1}
                max={359}
                step={1}
                value={documentValue.gameplay.abilities.shield.arcDeg}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.shield.arcDeg = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.shield.arcDeg = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Visuals" note="HUD and arc tint">
              <ColorField
                label="Accent"
                value={documentValue.visuals.abilities.shieldColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.shieldColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.shieldColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "boost":
        return (
          <>
            <InspectorSection title="Gameplay" note="Charge and impulse">
              <NumberField
                label="Charges"
                min={1}
                max={5}
                step={1}
                value={documentValue.gameplay.abilities.boost.charges}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.charges = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.charges = value;
                  })
                }
              />
              <NumberField
                label="Cooldown"
                min={0.05}
                max={120}
                step={0.05}
                value={documentValue.gameplay.abilities.boost.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Magnitude"
                min={0}
                max={4000}
                step={10}
                value={documentValue.gameplay.abilities.boost.magnitude}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.abilities.boost.magnitude = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.abilities.boost.magnitude = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Visuals" note="Burst tint">
              <ColorField
                label="Accent"
                value={documentValue.visuals.abilities.boostColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.abilities.boostColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.abilities.boostColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "drone":
        return (
          <>
            <InspectorSection title="Gameplay" note="Flight model and cooldown">
              <NumberField
                label="Speed"
                min={1}
                max={4000}
                step={1}
                value={documentValue.gameplay.drone.speed}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.speed = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.speed = value;
                  })
                }
              />
              <NumberField
                label="Thrust"
                min={0}
                max={4000}
                step={1}
                value={documentValue.gameplay.drone.thrust}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.thrust = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.thrust = value;
                  })
                }
              />
              <NumberField
                label="Fuel"
                min={0.1}
                max={120}
                step={0.1}
                value={documentValue.gameplay.drone.fuel}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.fuel = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.fuel = value;
                  })
                }
              />
              <NumberField
                label="TTL"
                min={0.1}
                max={300}
                step={0.1}
                value={documentValue.gameplay.drone.ttlSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.ttlSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.ttlSec = value;
                  })
                }
              />
              <NumberField
                label="Cooldown"
                min={0.05}
                max={300}
                step={0.05}
                value={documentValue.gameplay.drone.cooldownSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.cooldownSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.cooldownSec = value;
                  })
                }
              />
              <NumberField
                label="Burst impulse"
                min={0}
                max={4000}
                step={1}
                value={documentValue.gameplay.drone.burstImpulse}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.drone.burstImpulse = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.drone.burstImpulse = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection
              title="Visuals"
              note="Pilot and return state tints"
            >
              <ColorField
                label="Active"
                value={documentValue.visuals.drone.activeColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.drone.activeColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.drone.activeColor = value;
                  })
                }
              />
              <ColorField
                label="Return"
                value={documentValue.visuals.drone.returnColor}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.drone.returnColor = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.drone.returnColor = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
      case "cache":
        return (
          <>
            <InspectorSection
              title="Gameplay"
              note="Pickup pressure and rotation"
            >
              <NumberField
                label="Count"
                min={0}
                max={20}
                step={1}
                value={documentValue.gameplay.cache.count}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.count = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.count = value;
                  })
                }
              />
              <NumberField
                label="Respawn"
                min={0}
                max={300}
                step={0.1}
                value={documentValue.gameplay.cache.respawnSec}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.respawnSec = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.respawnSec = value;
                  })
                }
              />
              <NumberField
                label="Wildcard chance"
                min={0}
                max={1}
                step={0.01}
                value={documentValue.gameplay.cache.wildcardChance}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.gameplay.cache.wildcardChance = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.gameplay.cache.wildcardChance = value;
                  })
                }
              />
            </InspectorSection>
            <InspectorSection title="Visuals" note="Badge scale in the arena">
              <NumberField
                label="Badge scale"
                min={0.5}
                max={3}
                step={0.05}
                value={documentValue.visuals.caches.badgeScale}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.caches.badgeScale = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.caches.badgeScale = value;
                  })
                }
              />
              <NumberField
                label="Base size"
                min={16}
                max={240}
                step={1}
                value={documentValue.visuals.caches.badgeBaseSize}
                onPreviewChange={(value) =>
                  applyPreviewChange((draft) => {
                    draft.visuals.caches.badgeBaseSize = value;
                  })
                }
                onCommit={(value) =>
                  commitChange((draft) => {
                    draft.visuals.caches.badgeBaseSize = value;
                  })
                }
              />
            </InspectorSection>
          </>
        );
    }
  };

  const previewMode = getPreviewMode(selectedItemId);

  return (
    <div className="edit-shell">
      <aside className="edit-column edit-column--objects">
        <div className="edit-panel edit-panel--sticky">
          <div className="edit-panel__eyebrow">/edit</div>
          <h1 className="edit-panel__title">Tuning Editor</h1>
          <p className="edit-panel__body">
            Select an object, change values on the right, then commit with Enter
            or blur. The center preview swaps between focused object showcases
            and the arena view depending on what you are editing.
          </p>
          <div className={`edit-status edit-status--${saveStatus}`}>
            {describeSaveState(saveStatus)}
          </div>
          {saveError ? (
            <div className="edit-status-note">{saveError}</div>
          ) : null}
        </div>

        <section className="edit-panel edit-panel--views">
          <div className="edit-panel__eyebrow">Views</div>
          <div className="edit-object-list">
            {EDITOR_VIEW_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`edit-object-card${
                  selectedItemId === item.id ? " edit-object-card--active" : ""
                }`}
                onClick={() => setSelectedItemId(item.id)}
              >
                <EditorItemPreview
                  documentValue={documentValue}
                  itemId={item.id}
                />
                <span className="edit-object-card__copy">
                  <span className="edit-object-card__label">{item.label}</span>
                  <span className="edit-object-card__note">{item.note}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {EDITOR_GROUPS.map((group) => (
          <section key={group.label} className="edit-panel">
            <div className="edit-panel__eyebrow">{group.label}</div>
            <div className="edit-object-list">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`edit-object-card${
                    selectedItemId === item.id
                      ? " edit-object-card--active"
                      : ""
                  }`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <EditorItemPreview
                    documentValue={documentValue}
                    itemId={item.id}
                  />
                  <span className="edit-object-card__copy">
                    <span className="edit-object-card__label">
                      {item.label}
                    </span>
                    <span className="edit-object-card__note">{item.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </aside>

      <main className="edit-column edit-column--preview">
        <div className="edit-preview-frame">
          <EditorPreviewStage
            key={`${selectedItemId}:${previewRevision}`}
            documentValue={documentValue}
            hudTuning={documentValue.visuals.hud}
            mode={previewMode.mode}
            showHud={previewMode.showHud}
          />
          <div className="edit-preview-overlay">
            <div className="edit-preview-overlay__badge">
              {previewMode.label}
            </div>
          </div>
        </div>
      </main>

      <aside className="edit-column edit-column--inspector">
        <div className="edit-panel edit-panel--sticky">
          <div className="edit-panel__eyebrow">Inspector</div>
          <div className="edit-panel__title edit-panel__title--small">
            {getEditorItemMeta(selectedItemId)?.label}
          </div>
          <div className="edit-panel__body">
            Saved values go directly into the shared tuning file.
          </div>
        </div>
        <div className="edit-inspector">{renderInspector()}</div>
      </aside>
    </div>
  );
}
