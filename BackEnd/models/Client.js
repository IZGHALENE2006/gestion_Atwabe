import mongoose from "mongoose";
import { CLIENT_TYPES, CLIENT_FIELD_LIMITS, CLIENT_REQUIRED_FIELDS } from "../../shared/clients.js";

const clientSchema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: CLIENT_TYPES, required: true },
  ...Object.fromEntries(Object.entries(CLIENT_FIELD_LIMITS).map(([key, maxlength]) => [key, {
    type: String, trim: true, maxlength, required: CLIENT_REQUIRED_FIELDS.includes(key), default: "",
  }])),
}, { timestamps: true });

clientSchema.index({ idAdmin: 1, name: 1, _id: 1 });
export default mongoose.model("Client", clientSchema);
