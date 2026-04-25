import { startTransition, useEffect, useState } from "react";
import { AuthoritativeGamePanel } from "./AuthoritativeGamePanel";
import { loadRuntimeTuningDocument } from "./game/runtimeTuning";

export function NetworkGamePage() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void loadRuntimeTuningDocument("online").then(() => {
      if (active) {
        startTransition(() => {
          setRevision((current) => current + 1);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return <AuthoritativeGamePanel key={revision} className="app-shell" />;
}
