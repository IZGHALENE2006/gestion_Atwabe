
import CategoryModel from '../models/Category.js'
import productModel from '../models/productModel.js'

//Add New Category
export const AddCategory = async(req,res)=>{
    const {name,DateCreate} = req.body
try{
        const NewCategory = await CategoryModel.create({
        idAdmin:req.user.id,
        name,
        DateCreate
    })
    res.status(201).json(NewCategory)
}catch(err){
    res.status(500).json({message:"Server Error"})
}
}   
//All Category
export const GetCategory = async(req,res)=>{
    const Categoreis = await CategoryModel.find({idAdmin:req.user.idAdmin})
    res.json(Categoreis)
}

 //delete Category

 export const DeleteCategory  = async(req,res)=>{
    const {id} = req.params
    const DeleteItem = await CategoryModel.findByIdAndDelete(id)
  if(!DeleteItem) return res.status(404).json({message:"Not Found"})
    res.status(201).json(DeleteItem)

 }

    // Update Category

    export const UpdateCategory = async(req,res)=>{
        const {id} = req.params 
        const {name} = req.body


        const Newitem  = await CategoryModel.findByIdAndUpdate(id,
           {name},
           {new:true}
        )   

        if(!Newitem) return res.status(404).json({message:"Not Found"})
        res.status(201).json(Newitem)
    }