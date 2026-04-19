import {
  disposeViewportDisposables,
  type ViewportDisposable,
} from "./disposables";

export const disposeLocalViewportDisposables = (
  disposables: ViewportDisposable[],
) => {
  disposeViewportDisposables(disposables, "game viewport resource");
};
