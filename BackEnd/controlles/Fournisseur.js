import FournisseurModel from "../models/Fournisseur.js";

// Add New Fournisseur
export const AddFournisseur = async (req, res) => {
  const { name, email, phone, Ville, DateCreate } = req.body;

  try {
    const NewFournisseur = await FournisseurModel.create({
      idAdmin: req.user.id,
      name,
      email,
      phone,
      Ville,
      DateCreate,
    });

    res.status(201).json(NewFournisseur);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
};

// All Fournisseurs
export const GetFournisseur = async (req, res) => {
  const Fournisseurs = await FournisseurModel.find({
    idAdmin: req.user.id,
  }).select("-invoices");
  res.json(Fournisseurs);
};

// Delete Fournisseur
export const DeleteFournisseur = async (req, res) => {
  const { id } = req.params;

  const filter = { _id: id, idAdmin: req.user.id };
  const supplier = await FournisseurModel.findOne(filter);
  if (!supplier) return res.status(404).json({ message: "Not Found" });
  if (supplier.invoices?.length) return res.status(409).json({ message: "supplierHasInvoices" });
  const DeleteItem = await FournisseurModel.findOneAndDelete({ ...filter, "invoices.0": { $exists: false } });
  if (!DeleteItem)
    return res.status(409).json({ message: "supplierHasInvoices" });

  res.status(201).json(DeleteItem);
};

// Update Fournisseur
export const UpdateFournisseur = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, Ville} = req.body;

  const NewItem = await FournisseurModel.findOneAndUpdate(
    { _id: id, idAdmin: req.user.id },
    { name, email, phone, Ville },
    { new: true }
  ).select("-invoices");

  if (!NewItem)
    return res.status(404).json({ message: "Not Found" });

  res.status(201).json(NewItem);
};
