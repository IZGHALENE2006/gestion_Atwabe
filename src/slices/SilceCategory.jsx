import { createSlice } from "@reduxjs/toolkit";
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

//Add Caterory
export const AddCategory = createAsyncThunk("AddCategory",async(category,{rejectWithValue})=>{
    const Token  = localStorage.getItem('token')
    try{
        const res = await axios.post("http://localhost:7000/Category/Add",category,{
            headers:{
                Authorization:`Bearer ${Token}`
            }
        })
        
        return res.data
    }catch(error){
        return rejectWithValue(
        error.response?.data?.message || "Server error"
        )
    }
})
//Get All Caterory 
export const GetAllCatefory = createAsyncThunk("GetAllCatefory",async()=>{
    const Token  = localStorage.getItem('token')
    try{
        const res = await axios.get("http://localhost:7000/Category/Get",{
            headers:{
                Authorization:`Bearer ${Token}`
            }
        })
       

        return res.data
    }catch(error){
     console.log(error)
     
    }
})

//Delete Category
export const DeleteCategory  = createAsyncThunk('DeleteCategory',async(id,{rejectWithValue})=>{
    const Token = localStorage.getItem('token')
    try{
        const res  = await axios.delete(`http://localhost:7000/Category/Delete/${id}`,
            {
                headers:{
                    Authorization:`Bearer ${Token}`
                }
            }
        )
        return res.data
    }catch(err){
        return rejectWithValue(
        err.response?.data?.message || "Server error"

        )
    }

})
//UpdateCategory
export const UpdateCategory = createAsyncThunk("UpdateCategory",async(data,{rejectWithValue})=>{
    const Token  = localStorage.getItem('token')
  
    console.log(data);
    
    try{
        const res = await axios.patch(`http://localhost:7000/Category/Update/${data.id}`,{name:data.name},{
            headers:{
                Authorization:`Bearer ${Token}`
            }
        })
        
        return res.data
    }catch(error){
        return rejectWithValue(
        error.response?.data?.message || "Server error"
        )
    }
})
const inialState ={
Category:[],
loading:false,
error:null
}
const SliceCateroy = createSlice(
    {
        name:"Category",
        initialState:inialState,
        reducers:{},
     extraReducers: (builder) => {

  //  Add product
  builder
    .addCase(AddCategory.pending, (state) => {
      state.loading = true
      state.error = null
    })
    .addCase(AddCategory.fulfilled, (state, action) => {
      state.loading = false
      state.error = null
    state.Category.push(action.payload);

    })
    .addCase(AddCategory.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload
    })

  //  Get all products
  builder
    .addCase(GetAllCatefory.fulfilled, (state, action) => {
      state.Category = action.payload
    })
    //Delete Category 
   builder  
   .addCase(DeleteCategory.pending,(state,action)=>{
      state.loading = true
      state.error = null
   })
   .addCase(DeleteCategory.fulfilled,(state,action)=>{
          state.loading = false
      state.error = null
    state.Category = state.Category.filter((t)=>t._id!==action.payload._id)
   })
     .addCase(DeleteCategory.rejected,(state,action)=>{
      state.loading = false
      state.error = action.payload
   })
   //UpdateCategory
   builder  
   .addCase(UpdateCategory.pending,(state,action)=>{
      state.loading = true
      state.error = null
   })
   .addCase(UpdateCategory.fulfilled,(state,action)=>{
          state.loading = false
      state.error = null
      const Categoryitem = state.Category.find((t)=>t._id ===action.payload._id)
     
    if(Categoryitem){
         Categoryitem.name = action.payload.name
    }


   })
     .addCase(UpdateCategory.rejected,(state,action)=>{
      state.loading = false
      state.error = action.payload
   })
}

     
        
    }
)
export default SliceCateroy.reducer