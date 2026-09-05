import { configureStore } from "@reduxjs/toolkit";
import ordersReducer from "./ordersSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      orders: ordersReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
