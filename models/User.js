import mongoose from 'mongoose';

delete mongoose.models.User; // Anti-cache

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, default: "Architecte" },
  image: { type: String, default: "https://i.pinimg.com/736x/6e/02/51/6e02519899393fa847d87d57c63e6cf0.jpg" },
  systemStartDate: { type: Date, default: new Date('2026-01-01') },
  // LE FIX EST ICI : On autorise MongoDB à stocker tes Sandboxes
  sandboxes: { type: Array, default: [] }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);