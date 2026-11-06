import EmployeModel from '../models/EmployeModele.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import productModel from '../models/productModel.js'
import { validateCompensation } from '../../shared/employeePayroll.js';
import { validateEmployeePermissions } from '../../shared/employeePermissions.js';

//Add Employe 

export const AddEmploye= async(req,res)=>{
    const {name,phone,cin,email,password,color,isActive} =req.body
    let compensation;
    try { if (req.body.compensation !== undefined) compensation = validateCompensation(req.body.compensation); }
    catch { return res.status(400).json({ message: 'employeeCompensationInvalid' }); }
    let permissions = {};
    try { if (req.body.moduleAccess !== undefined || req.body.action !== undefined || req.body.operationPermissions !== undefined) permissions = validateEmployeePermissions(req.body); }
    catch { return res.status(400).json({ message: 'invalidPermissions' }); }
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
        isActive,
        ...permissions,
        ...(compensation ? { compensation } : {})
        
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
        role: employe.role,
        moduleAccess: employe.moduleAccess,
        operationPermissions: employe.operationPermissions,
        action: employe.action
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
         const DeleteEmploye = await EmployeModel.findOneAndDelete({ _id: id, idAdmin: req.user.id })
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
      const user = email === undefined ? null : await EmployeModel.findOne({email,_id:{$ne:id}})
    if(user) return res.status(400).json({message:"email if exite"})
    const usercin = cin === undefined ? null : await EmployeModel.findOne({cin,_id:{$ne:id}})
     if(usercin) return res.status(400).json({message:"cin if exite"})
     
    const newEmploye = await EmployeModel.findOneAndUpdate({ _id: id, idAdmin: req.user.id },
      {
        name,phone,cin,email,password,isActive
      }, { new: true, runValidators: true }
    )
     if(!newEmploye) return res.status(404).json({message:"Not Found"})
      res.status(200).json(newEmploye)
}catch(err){
  res.status(500).json({message:err.message})
}
   
   
 }

export async function UpdateEmployeePermissions(req, res) {
  let permissions;
  try { permissions = validateEmployeePermissions(req.body); }
  catch { return res.status(400).json({ message: 'invalidPermissions' }); }
  try {
    const employee = await EmployeModel.findOneAndUpdate({ _id: req.params.id, idAdmin: req.user.id }, { $set: permissions }, { new: true, runValidators: true });
    if (!employee) return res.status(404).json({ message: 'Not Found' });
    res.json(employee);
  } catch { res.status(500).json({ message: 'permissionsSaveFailed' }); }
}

