import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchOrdersFromClient, OrdersResponse } from "../client/orders-client-service";

interface Order {
  id: number;
  title: string;
  completed: boolean;
}

interface OrdersState {
  orders: Order[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
  // Carried through from the client service / API route response so a
  // failed request can be reported with something traceable. This traceId
  // is the client-generated `traceparent` trace-id, extracted by the
  // server and returned unchanged as x-trace-id - not a separate
  // correlation concept.
  traceId?: string;
}

const initialState: OrdersState = {
  orders: [],
  status: "idle",
};

// The dispatch-triggered call lives in this thunk, not in a component or
// the reducer - `dispatch(fetchOrders())` is synchronous, the actual fetch
// (and the traceparent it generates) happens inside here.
//
// rejectWithValue (rather than throwing) is what lets a *server-reported*
// failure (success: false, but a valid response with a traceId) surface
// its traceId into the rejected action's payload, so the UI can show
// "something failed - ref: <traceId>" instead of losing it.
export const fetchOrders = createAsyncThunk(
  "orders/fetch",
  async (_: void, { rejectWithValue }) => {
    const result = await fetchOrdersFromClient();
    if (!result.success) {
      return rejectWithValue(result);
    }
    return result;
  }
);

const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.orders = action.payload.orders ?? [];
        state.traceId = action.payload.traceId;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.status = "failed";
        // action.payload is set when the thunk called rejectWithValue
        // (a server-reported failure, with a traceId); otherwise this was
        // a network-level failure with no server response to read one from.
        const payload = action.payload as OrdersResponse | undefined;
        state.error = payload?.error ?? action.error.message ?? "Unknown error";
        state.traceId = payload?.traceId;
      });
  },
});

export default ordersSlice.reducer;
