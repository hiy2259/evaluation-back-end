import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const criterionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    indicator: { type: String, default: '' },
    order: { type: Number, required: true },
  },
  { collection: 'criteria', versionKey: false },
);

criterionSchema.index({ order: 1 });

export type CriterionDoc = InferSchemaType<typeof criterionSchema> & { _id: Schema.Types.ObjectId };
export const Criterion: Model<CriterionDoc> = model<CriterionDoc>('Criterion', criterionSchema);
