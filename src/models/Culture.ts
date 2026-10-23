import { Schema, model, models } from 'mongoose';

const CultureSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true, index: true },
  region: { type: String, default: 'Sumatera Selatan' },
  summary: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  facts: [{ type: String }],
  sources: [{ label: String, url: String }],
}, { timestamps: true });

export type CultureDocument = {
  title: string; slug: string; category: string; region: string; summary: string;
  description: string; imageUrl?: string; facts?: string[]; sources?: {label:string;url:string}[];
};
export default models.Culture || model('Culture', CultureSchema);
