import Admin from '../models/AdminModel.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import AdminModel from '../models/AdminModel.js'
//Register Admin
export const CreatAdmin = async(req,res)=>{
    const {name,email,password}  = req.body
       const Admins = await Admin.findOne({email})
     if(Admins) return res.status(400).json({message:"email if exite"})
    const admin = await Admin.create({name,email,password})
    if(!admin) return res.status(404).json({message:"Not Found"})
        res.status(201).json(admin)    
}

//Login Admin

export const LoginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const Admins = await Admin.findOne({ email });
    if (!Admins)
      return res.status(404).json({ message: "Email incorrect" });

    const isMatch = await bcrypt.compare(password, Admins.password);
    if (!isMatch)
      return res.status(404).json({ message: "Password incorrect" });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not defined" });
    }

    const Token = jwt.sign(
      {
        id: Admins._id,
        role: Admins.role,
        idAdmin: Admins._id
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      Token,
      user: {
        id: Admins._id,
        name: Admins.name,
        email: Admins.email,
        role: Admins.role
      }
    });

  } catch (error) {
    console.error("LOGIN ADMIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


//GetAdmin
export const getAdminFromToken =async (req,res)=>{
    const admin =await AdminModel.findById(req.user.id).select("-password")
    res.json(admin)
}

//UpdatePasswod
export const UpdatePassword = async (req, res) => {
  try {
    const { old, newpass, newpass2 } = req.body;

    const user = await AdminModel.findById(req.user.id);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(old, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password incorrect" });

    if (newpass !== newpass2)
      return res.status(400).json({ message: "Password not confirmed" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newpass, salt);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
