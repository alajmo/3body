import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyGameplayTuning,
  cloneGameTuningDocument,
  CURRENT_GAME_TUNING,
  sanitizeGameTuning,
  type GameTuningDocument,
} from "@3body/shared";

const TUNING_FILE_PATH = resolve(
  import.meta.dir,
  "../../shared/src/tuning/current.json",
);

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

  await writeFile(
    TUNING_FILE_PATH,
    `${JSON.stringify(nextDocument, null, 2)}\n`,
    "utf8",
  );

  applyGameplayTuning(nextDocument.gameplay);
  return nextDocument;
};
