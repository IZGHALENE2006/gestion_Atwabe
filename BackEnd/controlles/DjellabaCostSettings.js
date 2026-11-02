import { tailoringCostSettingsModel } from "../utils/tailoringCostSettings.js";
import { tailoringAccessFor } from "./TailoringOrders.js";
import { DJELLABA_RATE_FIELDS, validateDjellabaRates } from "../../shared/tailoringCosts.js";
const publicSettings = settings => settings ? { configured: true, version: settings.__v, rates: Object.fromEntries(DJELLABA_RATE_FIELDS.map(key => [key, settings[key]])) } : { configured: false, version: null, rates: null };
const errorReply = (res, error) => {
  if (error.message === "invalidCostSettings") return res.status(400).json({ message: error.message, fields: error.fields });
  if (error.name === "VersionError" || error.code === 11000) return res.status(409).json({ message: "costSettingsConflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : "costSettingsFailed" });
};
export async function getDjellabaCostSettings(req, res) {
  try {
    const Settings = tailoringCostSettingsModel(req.query.garment);
    const { idAdmin, permissions } = await tailoringAccessFor(req);
    res.json({ ...publicSettings(await Settings.findOne({ idAdmin })), canEdit: permissions.update });
  } catch (error) { errorReply(res, error); }
}
export async function saveDjellabaCostSettings(req, res) {
  try {
    const Settings = tailoringCostSettingsModel(req.query.garment);
    const { idAdmin, createdBy } = await tailoringAccessFor(req, "update");
    const rates = validateDjellabaRates(req.body?.rates), version = req.body?.version;
    if (version !== null && (!Number.isInteger(version) || version < 0)) throw Object.assign(new Error("invalidCostSettings"), { fields: { version: "costSettingsConflict" } });
    let document = await Settings.findOne({ idAdmin });
    if (document) {
      // Repeating an already saved set of rates is safe after a lost response.
      if (DJELLABA_RATE_FIELDS.every(key => document[key] === rates[key])) return res.json({ ...publicSettings(document), canEdit: true });
      if (document.__v !== version) return res.status(409).json({ message: "costSettingsConflict" });
      document.set({ ...rates, updatedBy: createdBy });
      await document.save();
    } else {
      if (version !== null) return res.status(409).json({ message: "costSettingsConflict" });
      document = await Settings.create({ ...rates, idAdmin, updatedBy: createdBy, __v: 0 });
    }
    res.json({ ...publicSettings(document), canEdit: true });
  } catch (error) { errorReply(res, error); }
}
