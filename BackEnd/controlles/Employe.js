import EmployeModel from '../models/EmployeModele.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import productModel from '../models/productModel.js'

//Add Employe 

export const AddEmploye= async(req,res)=>{
    const {name,phone,cin,email,password,color,isActive} =req.body
    const item  = await EmployeModel.findOne({email})
     if(item) return res.status(400).json({message:"email if exite"})
        const cinExist = await EmployeModel.findOne({ cin });
if (cinExist) {
  return res.status(400).json({ message: "CIN already exists" });
}

    if (!cin) {
      return res.status(400).json({ message: "CIN is required" });
    }
    if (!name) {
      return res.status(400).json({ message: "nom is required" });
    }
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }
      if (!password) {
      return res.status(400).json({ message: "password is required" });
    }
    if (cin.length < 6 || cin.length > 8) {
      return res.status(400).json({ message: "CIN length must be between 6 and 8 digits" });
    }

        const newEmploye  = await EmployeModel.create({
        idAdmin :req.user.id || null,
        name,
         cin,
        phone,
       
        email,
        password,
        color,
        isActive
        
    })
    if(!newEmploye) return res.status(404).json({message:"Not Found"})
     res.status(201).json(newEmploye)
}

//LoginEmploye 
export const LoginEmploye = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et password obligatoires" });
    }

    const employe = await EmployeModel.findOne({ email });
    if (!employe) {
      return res.status(404).json({ message: "Email incorrect" });
    }

    if (employe.password!==password) {
      return res.status(404).json({ message: "Password incorrect" });
    }

    if (!employe.isActive) {
      return res.status(403).json({
        message: "Votre compte a été temporairement suspendu"
      });
    }

    const Token = jwt.sign(
      { id: employe._id, role: employe.role,idAdmin:employe.idAdmin},
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      Token,
      user: {
        id: employe._id,
          idAdmin: employe.idAdmin,
        name: employe.name,
        email: employe.email,
        role: employe.role
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

//Get All employe

export const AllEmploye = async(req,res)=>{
    const AllEmp = await EmployeModel.find({idAdmin:req.user.id})
    res.status(200).json(AllEmp)
}

//Delete Employe 
export const DeleteEmploye = async(req,res)=>{
       const {id} = req.params
      try{
         const DeleteEmploye = await EmployeModel.findByIdAndDelete(id)
       if(!DeleteEmploye) return res.status(404).json({message:"Not Found"})
        res.json(DeleteEmploye)
      }catch(err){
             res.status(500).json({message:err.message})
      }
}

//Update Employe
 export const  UpdateEmploye = async(req,res)=>{
    const {id} = req.params
    const {name,phone,cin,email,password,isActive} = req.body
try{
      const user = await EmployeModel.findOne({email,_id:{$ne:id}})
    if(user) return res.status(400).json({message:"email if exite"})
    const usercin = await EmployeModel.findOne({cin,_id:{$ne:id}})
     if(usercin) return res.status(400).json({message:"cin if exite"})
     
    const newEmploye = await EmployeModel.findByIdAndUpdate(id,
      {
        name,phone,cin,email,password,isActive
      }
    )
     if(!newEmploye) return res.status(404).json({message:"Not Found"})
      res.status(200).json(newEmploye)
}catch(err){
  res.status(500).json({message:err.message})
}
   
   
 }

