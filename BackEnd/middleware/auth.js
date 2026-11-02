import jwt from 'jsonwebtoken'
export const auth= (req,res,next)=>{
    const authHeader = req.headers.authorization
    if(!authHeader) return res.status(401).json({message:"No token provided"})
        const Token  = authHeader.split(" ")[1]
    try{
        const decoded = jwt.verify(Token,process.env.JWT_SECRET)
        req.user = decoded
        next()
    }catch(error){
         res.status(401).json({ message: "Invalid token" });
    }
}

