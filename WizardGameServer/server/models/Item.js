import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ["weapon", "armor", "potion"], required: true },
  price: { type: Number, required: true },
  power: { type: Number, default: 0 },
});

export default mongoose.model("Item", itemSchema);
