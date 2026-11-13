import { tailoringCostSettingsModel } from "../utils/tailoringCostSettings.js";
import { tailoringAccessFor } from "./TailoringOrders.js";
import { tailoringRateFields, validateDjellabaRates, trouserLaborRates } from "../../shared/tailoringCosts.js";
import { tailoringMoneyCents } from "../../shared/tailoring.js";
const pricingVersionFor = req => ["2", "3"].includes(req.query.pricingVersion) ? Number(req.query.pricingVersion) : 1;
const publicSettings = (settings, garmentType, pricingVersion = 1) => {
  if (!settings) return { configured: false, version: null, rates: null, fourFillePrice: 0 };
  const fields = tailoringRateFields(garmentType, pricingVersion);
  const values = garmentType === "trousers" ? trouserLaborRates(settings) : settings;
  return { fourFillePrice: settings.fourFillePrice ?? 0, configured: fields.every(key => tailoringMoneyCents(values[key]) !== null), version: settings.__v, rates: Object.fromEntries(fields.map(key => [key, values[key] ?? null])) };
};
const errorReply = (res, error) => {
  if (error.message === "invalidCostSettings") return res.status(400).json({ message: error.message, fields: error.fields });
  if (error.name === "VersionError" || error.code === 11000) return res.status(409).json({ message: "costSettingsConflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : "costSettingsFailed" });
};
export async function getDjellabaCostSettings(req, res) {
  try {
    const Settings = tailoringCostSettingsModel(req.query.garment);
    const { idAdmin, permissions } = await tailoringAccessFor(req);
    res.json({ ...publicSettings(await Settings.findOne({ idAdmin }), req.query.garment, pricingVersionFor(req)), canEdit: permissions.settings });
  } catch (error) { errorReply(res, error); }
}
export async function saveDjellabaCostSettings(req, res) {
  try {
    const Settings = tailoringCostSettingsModel(req.query.garment), pricingVersion = pricingVersionFor(req);
    const { idAdmin, createdBy } = await tailoringAccessFor(req, "settings");
    const rates = validateDjellabaRates(req.body?.rates, req.query.garment, pricingVersion), version = req.body?.version;
    if (version !== null && (!Number.isInteger(version) || version < 0)) throw Object.assign(new Error("invalidCostSettings"), { fields: { version: "costSettingsConflict" } });
    if (req.query.garment === "trousers" && req.body?.fourFillePrice !== undefined) throw Object.assign(new Error("invalidCostSettings"), { fields: { fourFillePrice: "invalidFourFille" } });
    const fourFilleCents = req.body?.fourFillePrice === undefined ? undefined : tailoringMoneyCents(req.body.fourFillePrice);
    if (fourFilleCents === null) throw Object.assign(new Error("invalidCostSettings"), { fields: { fourFillePrice: "invalidMoney" } });
    const extraRate = fourFilleCents === undefined ? {} : { fourFillePrice: fourFilleCents / 100 };
    let document = await Settings.findOne({ idAdmin });
    if (document) {
      // Repeating an already saved set of rates is safe after a lost response.
      const savedRates = publicSettings(document, req.query.garment, pricingVersion).rates;
      if ((fourFilleCents === undefined || (document.fourFillePrice ?? 0) === fourFilleCents / 100) && tailoringRateFields(req.query.garment, pricingVersion).every(key => savedRates[key] === rates[key])) return res.json({ ...publicSettings(document, req.query.garment, pricingVersion), canEdit: true });
      if (document.__v !== version) return res.status(409).json({ message: "costSettingsConflict" });
      document.set({ ...rates, ...extraRate, ...(req.query.garment === "trousers" ? { laborPrice: undefined } : {}), updatedBy: createdBy });
      await document.save();
    } else {
      if (version !== null) return res.status(409).json({ message: "costSettingsConflict" });
      document = await Settings.create({ ...(pricingVersion >= 2 && req.query.garment !== "trousers" ? { laborPrice: 0 } : {}), ...rates, ...extraRate, idAdmin, updatedBy: createdBy, __v: 0 });
    }
    res.json({ ...publicSettings(document, req.query.garment, pricingVersion), canEdit: true });
  } catch (error) { errorReply(res, error); }
}
