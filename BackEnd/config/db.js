    import mongoose from "mongoose";
const ConnectDB = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log(" MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    console.error(error);  
  }
};


    export default ConnectDB