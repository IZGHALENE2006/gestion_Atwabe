import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/usercridite`;

const getAuthConfig = () => {
  const token = localStorage.getItem("token");
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const upsertUser = (users, updatedUser) => {
  const index = users.findIndex((u) => u._id === updatedUser._id);
  if (index === -1) {
    users.unshift(updatedUser);
    return;
  }
  users[index] = updatedUser;
};

export const addUserCiridite = createAsyncThunk(
  "credit/addUser",
  async (userData, { rejectWithValue }) => {
    try {
      const res = await axios.post(`${API_URL}/add`, userData, getAuthConfig());
      return res.data.user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const GetAllUserCridite = createAsyncThunk(
  "credit/getAllUsers",
  async (_, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${API_URL}/get`, getAuthConfig());
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const GetUserCriditeById = createAsyncThunk(
  "credit/getUserById",
  async (id, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${API_URL}/get/${id}`, getAuthConfig());
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const AddCreditLine = createAsyncThunk(
  "credit/addLine",
  async ({ userId, payload }, { rejectWithValue }) => {
    try {
      const res = await axios.post(
        `${API_URL}/add-product/${userId}`,
        payload,
        getAuthConfig()
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const AddCreditPayment = createAsyncThunk(
  "credit/addPayment",
  async ({ userId, payload }, { rejectWithValue }) => {
    try {
      const res = await axios.post(
        `${API_URL}/add-payment/${userId}`,
        payload,
        getAuthConfig()
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const DeleteCreditLine = createAsyncThunk(
  "credit/deleteLine",
  async ({ userId, productId }, { rejectWithValue }) => {
    try {
      const res = await axios.delete(
        `${API_URL}/DeleteProduct/${userId}/${productId}`,
        getAuthConfig()
      );
      return res.data.user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

export const DeleteUserCridite = createAsyncThunk(
  "credit/deleteUser",
  async (id, { rejectWithValue }) => {
    try {
      const res = await axios.delete(`${API_URL}/Delete/${id}`, getAuthConfig());
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Server error");
    }
  }
);

const initialState = {
  users: [],
  selectedUser: null,
  loading: false,
  actionLoading: false,
  error: null,
};

const SliceCridite = createSlice({
  name: "credit",
  initialState,
  reducers: {
    clearSelectedUser(state) {
      state.selectedUser = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(GetAllUserCridite.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(GetAllUserCridite.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
      })
      .addCase(GetAllUserCridite.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    builder
      .addCase(GetUserCriditeById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(GetUserCriditeById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedUser = action.payload;
        upsertUser(state.users, action.payload);
      })
      .addCase(GetUserCriditeById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    builder
      .addCase(addUserCiridite.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(addUserCiridite.fulfilled, (state, action) => {
        state.actionLoading = false;
        upsertUser(state.users, action.payload);
      })
      .addCase(addUserCiridite.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(AddCreditLine.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(AddCreditLine.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.selectedUser = action.payload.user;
        upsertUser(state.users, action.payload.user);
      })
      .addCase(AddCreditLine.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(AddCreditPayment.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(AddCreditPayment.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.selectedUser = action.payload.user;
        upsertUser(state.users, action.payload.user);
      })
      .addCase(AddCreditPayment.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(DeleteCreditLine.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(DeleteCreditLine.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.selectedUser = action.payload;
        upsertUser(state.users, action.payload);
      })
      .addCase(DeleteCreditLine.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });

    builder
      .addCase(DeleteUserCridite.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(DeleteUserCridite.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.users = state.users.filter((u) => u._id !== action.payload._id);
        if (state.selectedUser?._id === action.payload._id) {
          state.selectedUser = null;
        }
      })
      .addCase(DeleteUserCridite.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSelectedUser } = SliceCridite.actions;
export default SliceCridite.reducer;
