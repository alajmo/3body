import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyGameplayTuning,
  CURRENT_GAME_TUNING,
  cloneGameTuningDocument,
  type GameTuningDocument,
  sanitizeGameTuning,
} from "@3body/shared";
import { config } from "./config";

const TUNING_FILE_PATH = join(config.dataDir, "editor-tuning.json");
const CURRENT_TUNING_FILE_PATH = join(
  import.meta.dir,
  "../../shared/src/tuning/current.json",
);
let runtimeEditorTuningDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);

const serializeEditorTuningDocument = (value: GameTuningDocument): unknown => {
  return {
    ...value,
    gameplay: value.gameplay,
    visuals: value.visuals,
  };
};

export const readEditorTuningDocument =
  async (): Promise<GameTuningDocument> => {
    try {
      const raw = await readFile(TUNING_FILE_PATH, "utf8");
      return sanitizeGameTuning(JSON.parse(raw) as unknown);
    } catch {
      return cloneGameTuningDocument(CURRENT_GAME_TUNING);
    }
  };

export const writeEditorTuningDocument = async (
  value: unknown,
): Promise<GameTuningDocument> => {
  const nextDocument = sanitizeGameTuning(value);

  await mkdir(config.dataDir, { recursive: true });
  await writeFile(
    TUNING_FILE_PATH,
    `${JSON.stringify(serializeEditorTuningDocument(nextDocument), null, 2)}\n`,
    "utf8",
  );

  runtimeEditorTuningDocument = cloneGameTuningDocument(nextDocument);
  applyGameplayTuning(nextDocument.gameplay);
  return nextDocument;
};

export const loadEditorTuningIntoRuntime =
  async (): Promise<GameTuningDocument> => {
    const document = await readEditorTuningDocument();
    runtimeEditorTuningDocument = cloneGameTuningDocument(document);
    applyGameplayTuning(document.gameplay);
    return document;
  };

export const getRuntimeEditorTuningDocument = (): GameTuningDocument =>
  runtimeEditorTuningDocument;

export const syncEditorTuningDocumentToCurrent =
  async (): Promise<GameTuningDocument> => {
    const document = await readEditorTuningDocument();

    await writeFile(
      CURRENT_TUNING_FILE_PATH,
      `${JSON.stringify(serializeEditorTuningDocument(document), null, 2)}\n`,
      "utf8",
    );

    return document;
  };
