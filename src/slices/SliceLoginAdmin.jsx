import { createSlice } from "@reduxjs/toolkit";
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

//Login Admin 
export const Loginuser = createAsyncThunk('LoginAdmin',async({role,data},{rejectWithValue})=>{
    try{
      const url = role ==='admin'?"http://localhost:7000/api/admin/Login":"http://localhost:7000/Employe/Login"
        const res = await axios.post(url,data)
        return res.data
    }catch(error){
          return rejectWithValue(
            error.response?.data?.message || "Server error"
          ) 

    }


})
//Login Admin 
export const getMe = createAsyncThunk(
  "auth/getMe",
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem("token");

      const res = await axios.get(
        "http://localhost:7000/user/getMe",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return res.data; // { role, user }

    } catch (error) {
      return rejectWithValue(
        { message: error.response?.data?.message || "Server error", status: error.response?.status || 0 }
      );
    }
  }
);

    ////////////////////////////@@@@@@@@@@@Add Ventes///////////////////
    export const addVentes = createAsyncThunk("addVentes",async(data,{rejectWithValue})=>{
      const Token = localStorage.getItem("token")
      console.log(data);
      
      try{
            const res = await axios.post("http://localhost:7000/addVentes",data,{
            headers:{
                Authorization:`Bearer ${Token}`
           
            }
        })
        return res.data
      }catch(err){
        return rejectWithValue(
            { message: err.response?.data?.message || 'productCheckoutPending', status: err.response?.status || 0 }
              
        )
      }
    })
    //Update Password 
export const UpdatePassword= createAsyncThunk("UpdatePassword",async(data,{rejectWithValue})=>{
      const Token = localStorage.getItem("token")
      try{
            const res = await axios.post("http://localhost:7000/api/admin/UpdatePassword",data,{
            headers:{
                Authorization:`Bearer ${Token}`
           
            }
        })
        return res.data
      }catch(err){
        return rejectWithValue(
            err.response?.data?.message || "Server error"
              
        )
      }
})
// Redux action exported with its slice, not a React component.
// eslint-disable-next-line react-refresh/only-export-components
export const addCreditVente = createAsyncThunk("sales/addCredit", async (payload, { rejectWithValue }) => {
  try {
    const response = await axios.post(
      `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/addVentes/credit`, payload,
      { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
    );
    return response.data;
  } catch (error) {
    return rejectWithValue({ message: error.response?.data?.message || "creditCheckoutPending", status: error.response?.status || 0 });
  }
});
const initialState = {
  user: "",
  role: "",
  token: localStorage.getItem("token") || null,
  sessionReady: false,
  sessionError: false,
  sessionRequestId: null,
  loading: false,
  error: null

}
const LoginAdminSlice = createSlice(
    {
        name:"LginAdmin",
        initialState:initialState,
         reducers:{
          logoutAdmin:(state)=>{
           state.user = null;
           state.role = "";
           state.sessionReady = false;
           state.sessionError = false;
           state.sessionRequestId = null;
           state.token = null;
           state.error = null;
           localStorage.removeItem("token");
          }
         },
         extraReducers:(bulder)=>{
          bulder
          .addCase(Loginuser.pending,(state,action)=>{
            state.loading = true
            state.error= null
          })
          .addCase(Loginuser.fulfilled,(state,action)=>{
            state.loading = false
            state.error = null
            state.token = action.payload.Token
            state.user = action.payload.user
            state.role = action.payload.user?.role || ""
            state.sessionReady = false
            state.sessionError = false
            state.sessionRequestId = null
            localStorage.setItem('token',action.payload.Token)
          })
           .addCase(Loginuser.rejected,(state,action)=>{
            state.loading = false
            state.error = action.payload
        
          })
          bulder.addCase(getMe.fulfilled,(state,action)=>{
            if (!state.token || state.sessionRequestId !== action.meta.requestId) return;
            state.user = action.payload.user
            state.role = action.payload.role
            state.sessionReady = true
            state.sessionError = false
      
          })
          bulder.addCase(getMe.pending, (state, action) => { state.sessionError = false; state.sessionRequestId = action.meta.requestId; })
          bulder.addCase(getMe.rejected, (state, action) => {
            if (!state.token || state.sessionRequestId !== action.meta.requestId) return;
            state.sessionError = true;
            if ([401, 403, 404].includes(action.payload?.status)) state.sessionReady = false;
          })
          bulder
.addCase(addVentes.fulfilled, (state, action) => {
  state.loading = false;
  state.error = null;

  if (state.user?.ventes && action.payload?.lastVentes) {
    const ids = new Set(state.user.ventes.map(sale => sale._id));
    state.user.ventes.push(...action.payload.lastVentes.filter(sale => !ids.has(sale._id)));
  }
  if (state.user && action.payload?.facture) {
    state.user.Facture ??= [];
    if (!state.user.Facture.some(invoice => invoice._id === action.payload.facture._id)) state.user.Facture.push(action.payload.facture);
  }
});
bulder.addCase(addCreditVente.fulfilled, (state, action) => {
  if (!state.user) return;
  state.user.ventes ??= [];
  state.user.Facture ??= [];
  const ids = new Set(state.user.ventes.map(sale => sale._id));
  state.user.ventes.push(...action.payload.lastVentes.filter(sale => !ids.has(sale._id)));
  if (!state.user.Facture.some(invoice => invoice._id === action.payload.facture._id)) state.user.Facture.push(action.payload.facture);
});
//UpdateAdmin
        bulder
            .addCase(UpdatePassword.pending,(state)=>{
              state.loading = true
              state.error = null
            })
            .addCase(UpdatePassword.fulfilled,(state,action)=>{
              state.loading = false
              state.error = null
            })
            .addCase(UpdatePassword.rejected,(state,action)=>{
              state.loading = false
              state.error = action.payload
            
            })

         }
    }
)
export const {logoutAdmin} = LoginAdminSlice.actions
export default LoginAdminSlice.reducer
