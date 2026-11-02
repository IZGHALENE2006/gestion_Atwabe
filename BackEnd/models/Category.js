import mongoose from "mongoose";

const CategoryShema = new mongoose.Schema(
    {
        idAdmin:Object,
        name:{
            type:String,
            unique:true,
            required:true
        },
        DateCreate :Date
    }
)
export default mongoose.model('Categories',CategoryShema)