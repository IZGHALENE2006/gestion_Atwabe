import { createSlice } from "@reduxjs/toolkit";
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

//Add product
export const AddProduct = createAsyncThunk("AddProduct",async(product,{rejectWithValue})=>{
    const Token  = localStorage.getItem('token')
    try{
        const res = await axios.post("http://localhost:7000/Product/Add",product,{
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
//Get All Product 
export const GetAllProduct = createAsyncThunk("GetPrudct",async()=>{
    const Token  = localStorage.getItem('token')
    try{
        const res = await axios.get("http://localhost:7000/Product/Get",{
            headers:{
                Authorization:`Bearer ${Token}`
            }
        })
        return res.data
    }catch(error){
     console.log(error)
     
    }
})
//Delete product
export const DeleteProduit = createAsyncThunk("DeleteProduit",async(id,{rejectWithValue})=>{
    const Token  = localStorage.getItem('token')
    console.log(id);
    
    try{
        const res = await axios.delete(`http://localhost:7000/Product/Delete/${id}`,{
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
//UpdateProduit
export const updateProduit = createAsyncThunk("UpdateProduit",async(data,{rejectWithValue})=>{
    const Token  = localStorage.getItem('token')
   const {idupdate2} = data
    
    try{
        const res = await axios.put(`http://localhost:7000/Product/Update/${idupdate2}`,data.formData,{
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
Produts:[],
loading:false,
error:null
}
const SliceProduct = createSlice(
    {
        name:"product",
        initialState:inialState,
        reducers:{
          productRestocked(state, action) {
            const index = state.Produts.findIndex(product => product._id === action.payload._id);
            if (index >= 0) state.Produts[index] = { ...action.payload, categorie: state.Produts[index].categorie };
          }
        },
     extraReducers: (builder) => {

  //  Add product
  builder
    .addCase(AddProduct.pending, (state) => {
      state.loading = true
      state.error = null
    })
    .addCase(AddProduct.fulfilled, (state, action) => {
      state.loading = false
      state.error = null
    state.Produts.push(action.payload);

    })
    .addCase(AddProduct.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload
    })

  //  Get all products
  builder
    .addCase(GetAllProduct.fulfilled, (state, action) => {
      state.Produts = action.payload
    })
 //DeleteProduit      

      builder
    .addCase(DeleteProduit.pending, (state) => {
      state.loading = true
      state.error = null
    })
    .addCase(DeleteProduit.fulfilled, (state, action) => {
      state.loading = false
      state.error = null
    state.Produts = state.Produts.filter(((t)=>t._id!==action.payload._id))

    })
    .addCase(DeleteProduit.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload
    })

     //UpdateProduit      

      builder
    .addCase(updateProduit.pending, (state) => {
      state.loading = true
      state.error = null
    })
 .addCase(updateProduit.fulfilled, (state, action) => {
    state.loading = false;
    state.error = null;

    const index = state.Produts.findIndex(t => t._id === action.payload._id);
    if (index !== -1) state.Produts[index] = action.payload;
})

    .addCase(updateProduit.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload
    })
}

        
    }
)
// eslint-disable-next-line react-refresh/only-export-components -- Redux actions are exported with their slice.
export const { productRestocked } = SliceProduct.actions;
export default SliceProduct.reducer