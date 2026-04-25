import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyGameplayTuning,
  CURRENT_TUNING_BY_MODE,
  cloneGameTuningDocument,
  type GameTuningDocument,
  sanitizeGameTuning,
  type TuningMode,
} from "@3body/shared";
import { config } from "./config";

const TUNING_MODES = ["online", "offline"] as const satisfies TuningMode[];
const tuningPathFor = (mode: TuningMode): string =>
  join(config.dataDir, `editor-tuning.${mode}.json`);
const currentTuningPathFor = (mode: TuningMode): string =>
  join(import.meta.dir, `../../shared/src/tuning/current.${mode}.json`);
const runtimeEditorTuningDocuments = new Map<TuningMode, GameTuningDocument>(
  TUNING_MODES.map((mode) => [
    mode,
    cloneGameTuningDocument(CURRENT_TUNING_BY_MODE[mode]),
  ]),
);

const serializeEditorTuningDocument = (value: GameTuningDocument): unknown => {
  return {
    ...value,
    gameplay: value.gameplay,
    visuals: value.visuals,
  };
};

export const isTuningMode = (value: string): value is TuningMode =>
  TUNING_MODES.some((mode) => mode === value);

export const readEditorTuningDocument = async (
  mode: TuningMode,
): Promise<GameTuningDocument> => {
  try {
    const raw = await readFile(tuningPathFor(mode), "utf8");
    return sanitizeGameTuning(
      JSON.parse(raw) as unknown,
      CURRENT_TUNING_BY_MODE[mode],
    );
  } catch {
    return cloneGameTuningDocument(CURRENT_TUNING_BY_MODE[mode]);
  }
};

export const writeEditorTuningDocument = async (
  mode: TuningMode,
  value: unknown,
): Promise<GameTuningDocument> => {
  const nextDocument = sanitizeGameTuning(value, CURRENT_TUNING_BY_MODE[mode]);

  await mkdir(config.dataDir, { recursive: true });
  await writeFile(
    tuningPathFor(mode),
    `${JSON.stringify(serializeEditorTuningDocument(nextDocument), null, 2)}\n`,
    "utf8",
  );

  runtimeEditorTuningDocuments.set(mode, cloneGameTuningDocument(nextDocument));
  if (mode === "online") {
    applyGameplayTuning(nextDocument.gameplay);
  }
  return nextDocument;
};

export const loadEditorTuningIntoRuntime = async (): Promise<
  Map<TuningMode, GameTuningDocument>
> => {
  const loaded = new Map<TuningMode, GameTuningDocument>();
  for (const mode of TUNING_MODES) {
    const document = await readEditorTuningDocument(mode);
    runtimeEditorTuningDocuments.set(mode, cloneGameTuningDocument(document));
    loaded.set(mode, document);
  }

  applyGameplayTuning(runtimeEditorTuningDocuments.get("online")!.gameplay);
  return loaded;
};

export const getRuntimeEditorTuningDocument = (
  mode: TuningMode = "online",
): GameTuningDocument => runtimeEditorTuningDocuments.get(mode)!;

export const syncEditorTuningDocumentToCurrent = async (
  mode: TuningMode,
): Promise<GameTuningDocument> => {
  const document = await readEditorTuningDocument(mode);

  await writeFile(
    currentTuningPathFor(mode),
    `${JSON.stringify(serializeEditorTuningDocument(document), null, 2)}\n`,
    "utf8",
  );

  return document;
};
