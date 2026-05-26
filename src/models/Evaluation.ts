import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const scoreEntrySchema = new Schema(
  {
    criterionId: { type: Schema.Types.ObjectId, ref: 'Criterion', required: true },
    value: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false },
);

const evaluationSchema = new Schema(
  {
    judgeId: { type: Schema.Types.ObjectId, ref: 'Judge', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    scores: { type: [scoreEntrySchema], default: [] },
    comment: { type: String, default: '' },
    version: { type: Number, default: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: 'evaluations', versionKey: false },
);

evaluationSchema.index({ judgeId: 1, teamId: 1 }, { unique: true });
evaluationSchema.index({ updatedAt: -1 });
evaluationSchema.index({ teamId: 1 });

export type EvaluationDoc = InferSchemaType<typeof evaluationSchema> & { _id: Schema.Types.ObjectId };
export const Evaluation: Model<EvaluationDoc> = model<EvaluationDoc>('Evaluation', evaluationSchema);
