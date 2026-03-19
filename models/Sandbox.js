import mongoose from 'mongoose';
delete mongoose.models.Sandbox; // Anti-cache

const SandboxSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  nom: { type: String, required: true },
  couleur: { type: String, default: '#0054A4' },
  startDate: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('Sandbox', SandboxSchema);