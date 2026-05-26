import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const teamSchema = new Schema(
  {
    divisionId: { type: Schema.Types.ObjectId, ref: 'Division', required: true },
    name: { type: String, required: true, trim: true },
    projectName: { type: String, default: '' },
    owner: { type: String, default: '' },
    members: { type: [String], default: [] },
    oneLiner: { type: String, default: '' },
  },
  { collection: 'teams', versionKey: false },
);

teamSchema.index({ divisionId: 1 });

export type TeamDoc = InferSchemaType<typeof teamSchema> & { _id: Schema.Types.ObjectId };
export const Team: Model<TeamDoc> = model<TeamDoc>('Team', teamSchema);
