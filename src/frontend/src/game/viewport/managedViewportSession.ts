import {
  disposeViewportRendererSession,
  initializeViewportRendererSession,
  reportViewportRendererFailure,
} from "./rendererBootstrap";

type ManagedViewportInitializeOptions = Omit<
  Parameters<typeof initializeViewportRendererSession>[0],
  "failureLogLabel" | "hostElement" | "isDisposed"
>;

type ManagedViewportRendererSession = NonNullable<
  Awaited<ReturnType<typeof initializeViewportRendererSession>>
>;

export const createManagedViewportSession = ({
  failureLogLabel,
  hostElement,
  isDisposed,
}: {
  failureLogLabel: string;
  hostElement: HTMLDivElement;
  isDisposed: () => boolean;
}) => {
  let sessionToken = 0;

  return {
    invalidate: () => {
      sessionToken += 1;
    },
    reportFailure: (error: unknown) => {
      reportViewportRendererFailure({
        error,
        failureLogLabel,
        hostElement,
        isDisposed,
      });
    },
    start: async ({
      initializeOptions,
      onReady,
    }: {
      initializeOptions?: ManagedViewportInitializeOptions;
      onReady: (
        session: ManagedViewportRendererSession,
      ) => Promise<void> | void;
    }) => {
      const startToken = ++sessionToken;
      const session = await initializeViewportRendererSession({
        ...initializeOptions,
        failureLogLabel,
        hostElement,
        isDisposed,
      });

      if (session === null || startToken !== sessionToken) {
        if (session !== null) {
          disposeViewportRendererSession({
            bootstrap: session.bootstrap,
            hostElement,
            renderer: session.renderer,
          });
        }
        return;
      }

      await onReady(session);
    },
  };
};
