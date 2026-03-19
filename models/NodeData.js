// models/NodeData.js
import mongoose from 'mongoose';

const NodeDataSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  nodeId: { type: String, required: true },
  notes: { type: String, default: "" },
  todos: { type: Array, default: [] },
  sandboxId: { type: String, required: true },
  // NOUVEAU : On autorise MongoDB à sauvegarder les rituels actifs !
  activeRituals: { type: Array, default: [] } 
}, { timestamps: true });

NodeDataSchema.index({ userId: 1, nodeId: 1 }, { unique: true });
export default mongoose.models.NodeData || mongoose.model('NodeData', NodeDataSchema);