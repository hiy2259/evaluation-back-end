import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const divisionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { collection: 'divisions', versionKey: false },
);

export type DivisionDoc = InferSchemaType<typeof divisionSchema> & { _id: Schema.Types.ObjectId };
export const Division: Model<DivisionDoc> = model<DivisionDoc>('Division', divisionSchema);
