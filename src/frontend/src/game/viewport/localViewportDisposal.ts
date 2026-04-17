export const disposeLocalViewportDisposables = (
  disposables: Array<{ dispose: () => void }>,
) => {
  for (let index = disposables.length - 1; index >= 0; index -= 1) {
    try {
      disposables[index]!.dispose();
    } catch (error) {
      console.warn(
        "[frontend] Failed to dispose game viewport resource.",
        error,
      );
    }
  }

  disposables.length = 0;
};
