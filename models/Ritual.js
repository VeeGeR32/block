import mongoose from 'mongoose';

// Sécurité anti-cache Next.js
delete mongoose.models.Ritual;

const RitualSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  niveau: { type: Number, required: true }, 
  targetNiveau: { type: Number, required: true },
  nom: { type: String, required: true },
  pattern: { type: mongoose.Schema.Types.Mixed, required: true },
  sandboxId: { type: String, required: true },
  elements: { type: Array, default: [] }
}, { timestamps: true });

export default mongoose.model('Ritual', RitualSchema);