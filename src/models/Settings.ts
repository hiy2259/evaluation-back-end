import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'singleton' },
    disclosureOpen: { type: Boolean, default: false },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: 'settings', versionKey: false, _id: false },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema> & { _id: string };
export const Settings: Model<SettingsDoc> = model<SettingsDoc>('Settings', settingsSchema);

export const SETTINGS_ID = 'singleton' as const;
