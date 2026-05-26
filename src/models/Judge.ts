import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const judgeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    pinHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    role: { type: String, enum: ['judge', 'admin'], required: true, default: 'judge' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'judges', versionKey: false },
);

export type JudgeDoc = InferSchemaType<typeof judgeSchema> & { _id: Schema.Types.ObjectId };
export const Judge: Model<JudgeDoc> = model<JudgeDoc>('Judge', judgeSchema);
