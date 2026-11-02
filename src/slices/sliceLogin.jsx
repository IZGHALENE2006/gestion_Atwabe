import { createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const RegistreAdmin = createAsyncThunk('addAdmin',async(Admin,{ rejectWithValue })=>{
   try{
  const res = await axios.post('http://localhost:7000/api/admin/register',Admin)
    return res.data
   }catch(error){
         return rejectWithValue(error.response.data.message)
   }
})



const initailestate = {
   
    Admin: null,
    loading :false,
    error:null
}
const SliceLogin  = createSlice({
    name:"register",
initialState:initailestate,
reducers:{},
extraReducers(bulder){
       bulder.addCase(RegistreAdmin.pending,(State,action)=>{
              State.loading=true
            State.error=null
            
             
        }),
        bulder.addCase(RegistreAdmin.fulfilled,(State,action)=>{
          State.loading = false;
              State.Admin=action.payload
        }),
          bulder.addCase(RegistreAdmin.rejected,(State,action)=>{
              State.loading=false
            State.error=action.payload
        })

}
})
export default SliceLogin.reducer