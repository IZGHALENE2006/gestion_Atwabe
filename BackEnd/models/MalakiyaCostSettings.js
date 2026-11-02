import mongoose from "mongoose";
import DjellabaCostSettings from "./DjellabaCostSettings.js";

// Separate prices per section; existing djellaba settings and indexes stay intact.
export default mongoose.model("MalakiyaCostSettings", DjellabaCostSettings.schema.clone());
