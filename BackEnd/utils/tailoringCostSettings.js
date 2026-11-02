import DjellabaCostSettings from "../models/DjellabaCostSettings.js";
import JabadorCostSettings from "../models/JabadorCostSettings.js";

import MalakiyaCostSettings from "../models/MalakiyaCostSettings.js";

export function tailoringCostSettingsModel(garmentType = "djellaba") {
  if (garmentType === "djellaba") return DjellabaCostSettings;
  if (garmentType === "jabador") return JabadorCostSettings;
  if (garmentType === "malakiya") return MalakiyaCostSettings;
  throw Object.assign(new Error("invalidCostSettings"), { fields: { garmentType: "invalidGarmentType" } });
}
