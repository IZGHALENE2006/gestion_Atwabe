import EmployeModel from '../models/EmployeModele.js'
import AdminModel from '../models/AdminModel.js'

export const getMe = async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const admin = await AdminModel
        .findById(req.user.id)
        .select("-password");

      return res.json({ role: "admin", user: admin });
    }

    if (req.user.role === "Employe") {
      const employe = await EmployeModel
        .findById(req.user.id)
        .select("-password");

      return res.json({ role: "Employe", user: employe });
    }

    return res.status(403).json({ message: "Role inconnu" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
