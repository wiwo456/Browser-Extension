import type { NormalizedCategory } from "./activity.js";

export interface MlCategoryPrediction {
  normalizedCategory: NormalizedCategory;
  confidence: number;
  source: "ml-logreg";
}

export interface LogisticRegressionModel {
  version: 1;
  labels: NormalizedCategory[];
  featureVocabulary: string[];
  weights: number[][];
  biases: number[];
  metadata: {
    trainedAt: string;
    sampleCount: number;
    epochs: number;
    learningRate: number;
    maxExamplesPerCategory: number;
  };
}
