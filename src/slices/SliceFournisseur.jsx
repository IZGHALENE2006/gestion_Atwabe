import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

// Add Fournisseur
export const AddFournisseur = createAsyncThunk(
  "AddFournisseur",
  async (fournisseur, { rejectWithValue }) => {
    const Token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        "http://localhost:7000/Fournisseur/Add",
        fournisseur,
        {
          headers: {
            Authorization: `Bearer ${Token}`,
          },
        }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Server error"
      );
    }
  }
);

// Get All Fournisseurs
export const GetAllFournisseur = createAsyncThunk(
  "GetAllFournisseur",
  async (_, { rejectWithValue }) => {
    const Token = localStorage.getItem("token");
    try {
      const res = await axios.get(
        "http://localhost:7000/Fournisseur/Get",
        {
          headers: {
            Authorization: `Bearer ${Token}`,
          },
        }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Server error");
    }
  }
);

// Delete Fournisseur
export const DeleteFournisseur = createAsyncThunk(
  "DeleteFournisseur",
  async (id, { rejectWithValue }) => {
    const Token = localStorage.getItem("token");
    try {
      const res = await axios.delete(
        `http://localhost:7000/Fournisseur/Delete/${id}`,
        {
          headers: {
            Authorization: `Bearer ${Token}`,
          },
        }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Server error"
      );
    }
  }
);

// Update Fournisseur
export const UpdateFournisseur = createAsyncThunk(
  "UpdateFournisseur",
  async (data, { rejectWithValue }) => {
    const Token = localStorage.getItem("token");
   const{name,email,phone,Ville} = data.selectedSupplier
    
    try {
      const res = await axios.patch(
        `http://localhost:7000/Fournisseur/Update/${data.IdUpdate}`,
        {
          name,
          email,
          phone,
          Ville,
        },
        {
          headers: {
            Authorization: `Bearer ${Token}`,
          },
        }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Server error"
      );
    }
  }
);

const initialState = {
  Fournisseur: [],
  loading: false,
  error: null,
  listLoading: false,
  listError: null,
};

const SliceFournisseur = createSlice({
  name: "Fournisseur",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // Add Fournisseur
    builder
      .addCase(AddFournisseur.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(AddFournisseur.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.Fournisseur.push(action.payload);
      })
      .addCase(AddFournisseur.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Get All Fournisseurs
    builder
      .addCase(GetAllFournisseur.pending, (state) => {
        state.listLoading = true;
        state.listError = null;
      })
      .addCase(GetAllFournisseur.fulfilled, (state, action) => {
        state.listLoading = false;
        state.listError = null;
        state.Fournisseur = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(GetAllFournisseur.rejected, (state, action) => {
        state.listLoading = false;
        state.listError = action.payload || "Server error";
      });

    // Delete Fournisseur
    builder
      .addCase(DeleteFournisseur.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(DeleteFournisseur.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.Fournisseur = state.Fournisseur.filter(
          (t) => t._id !== action.payload._id
        );
      })
      .addCase(DeleteFournisseur.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Update Fournisseur
    builder
      .addCase(UpdateFournisseur.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(UpdateFournisseur.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;

        const item = state.Fournisseur.find(
          (t) => t._id === action.payload._id
        );

        if (item) {
          item.name = action.payload.name;
          item.email = action.payload.email;
          item.phone = action.payload.phone;
          item.Ville = action.payload.Ville;
          item.status = action.payload.status;
        }
      })
      .addCase(UpdateFournisseur.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default SliceFournisseur.reducer;
