"use client";

import { useRef } from "react";
import { Provider } from "react-redux";
import { AppStore, makeStore } from "./store";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // One store per browser tab, created lazily on first render - not at
  // module scope, so it isn't shared across requests/users on the server.
  const storeRef = useRef<AppStore>();
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  return <Provider store={storeRef.current}>{children}</Provider>;
}
