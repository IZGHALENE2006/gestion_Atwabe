import ShirtCostSettings from "../models/ShirtCostSettings.js";
import DjellabaCostSettings from "../models/DjellabaCostSettings.js";
import TrouserCostSettings from "../models/TrouserCostSettings.js";
import JabadorCostSettings from "../models/JabadorCostSettings.js";

import MalakiyaCostSettings from "../models/MalakiyaCostSettings.js";

export function tailoringCostSettingsModel(garmentType = "djellaba") {
  if (garmentType === "djellaba") return DjellabaCostSettings;
  if (garmentType === "shirts") return ShirtCostSettings;
  if (garmentType === "trousers") return TrouserCostSettings;
  if (garmentType === "jabador") return JabadorCostSettings;
  if (garmentType === "malakiya") return MalakiyaCostSettings;
  throw Object.assign(new Error("invalidCostSettings"), { fields: { garmentType: "invalidGarmentType" } });
}
