let editorEnabled = import.meta.env.DEV;

export const isEditorEnabled = (): boolean => editorEnabled;

export const setEditorEnabled = (value: boolean): void => {
  editorEnabled = value;
};

export const loadEditorEnabled = async (
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    const response = await fetchImpl("/api/editor/enabled");
    if (!response.ok) {
      return editorEnabled;
    }

    const body = (await response.json()) as { enabled?: unknown };
    editorEnabled = body.enabled === true;
  } catch {
    return editorEnabled;
  }

  return editorEnabled;
};
