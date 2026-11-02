import mongoose from "mongoose";
export const creditActorSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, default: "" },
  role: { type: String, enum: ["admin", "Employe"], required: true },
}, { _id: false });
