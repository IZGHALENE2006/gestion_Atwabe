import AdminModel from "../models/AdminModel.js";
import { normalizeInvoiceSettings, validateInvoiceSettings } from "../../shared/invoiceSettings.js";
import { saveInvoiceLogo, deleteInvoiceLogo } from "../utils/invoiceLogos.js";

export async function getInvoiceSettings(req, res) {
  try {
    const owner = req.user.role === "admin" ? req.user.id : req.user.idAdmin;
    if (!owner || !["admin", "Employe"].includes(req.user.role)) return res.status(403).json({ message: "forbidden" });
    const admin = await AdminModel.findById(owner).select("invoiceSettings");
    if (!admin) return res.status(404).json({ message: "notFound" });
    res.json(normalizeInvoiceSettings(admin.invoiceSettings));
  } catch {
    res.status(500).json({ message: "loadFailed" });
  }
}

export async function updateInvoiceSettings(req, res) {
  let settings;
  try {
    settings = validateInvoiceSettings(typeof req.body.settings === "string" ? JSON.parse(req.body.settings) : req.body.settings);
    if (req.body.removeLogo !== undefined && ![true, false, "true", "false"].includes(req.body.removeLogo)) throw new Error();
  } catch {
    return res.status(400).json({ message: "invalidSettings" });
  }
  let newLogo;
  let saved = false;
  try {
    if (req.file) newLogo = await saveInvoiceLogo(req.file);
    const patch = Object.fromEntries(Object.entries(settings).map(([key, value]) => [`invoiceSettings.${key}`, value]));
    if (newLogo) patch["invoiceSettings.logo"] = newLogo;
    else if (req.body.removeLogo === true || req.body.removeLogo === "true") patch["invoiceSettings.logo"] = "";
    // Return the previous logo atomically so replacing/removing it cannot delete a newer upload.
    const previous = await AdminModel.findOneAndUpdate({ _id: req.user.id }, { $set: patch }, { new: false, runValidators: true, projection: { invoiceSettings: 1 } });
    if (!previous) {
      if (newLogo) await deleteInvoiceLogo(newLogo);
      return res.status(404).json({ message: "notFound" });
    }
    saved = true;
    const oldSettings = normalizeInvoiceSettings(previous.invoiceSettings);
    const logo = patch["invoiceSettings.logo"] ?? oldSettings.logo;
    if (logo !== oldSettings.logo) await deleteInvoiceLogo(oldSettings.logo);
    res.json({ ...settings, logo });
  } catch {
    if (newLogo && !saved) await deleteInvoiceLogo(newLogo);
    res.status(500).json({ message: "saveFailed" });
  }
}
