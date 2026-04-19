export interface ViewportDisposable {
  dispose: () => void;
}

const isViewportDisposableList = (
  value: ViewportDisposable | readonly ViewportDisposable[],
): value is readonly ViewportDisposable[] => Array.isArray(value);

export const registerViewportDisposables = (
  disposables: ViewportDisposable[],
  ...items: Array<
    ViewportDisposable | readonly ViewportDisposable[] | null | undefined
  >
) => {
  for (const item of items) {
    if (item == null) {
      continue;
    }

    if (isViewportDisposableList(item)) {
      disposables.push(...item);
      continue;
    }

    disposables.push(item);
  }
};

export const disposeViewportDisposables = (
  disposables: ViewportDisposable[],
  resourceLabel: string,
) => {
  for (let index = disposables.length - 1; index >= 0; index -= 1) {
    try {
      disposables[index]!.dispose();
    } catch (error) {
      console.warn(`[frontend] Failed to dispose ${resourceLabel}.`, error);
    }
  }

  disposables.length = 0;
};
