import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyGameplayTuning,
  cloneGameTuningDocument,
  CURRENT_GAME_TUNING,
  sanitizeGameTuning,
  type GameTuningDocument,
} from "@3body/shared";
import { config } from "./config";

const TUNING_FILE_PATH = join(config.dataDir, "editor-tuning.json");
const CURRENT_TUNING_FILE_PATH = join(
  import.meta.dir,
  "../../shared/src/tuning/current.json",
);

const serializeEditorTuningDocument = (value: GameTuningDocument): unknown => {
  const { drone: _visualDrone, ...visuals } = value.visuals;
  const { drone: _gameplayDrone, ...gameplay } = value.gameplay;

  return {
    ...value,
    gameplay,
    visuals,
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

  applyGameplayTuning(nextDocument.gameplay);
  return nextDocument;
};

export const loadEditorTuningIntoRuntime =
  async (): Promise<GameTuningDocument> => {
    const document = await readEditorTuningDocument();
    applyGameplayTuning(document.gameplay);
    return document;
  };

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
