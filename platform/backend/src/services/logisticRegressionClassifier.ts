import { readFile } from "node:fs/promises";
import type { LogisticRegressionModel, MlCategoryPrediction } from "../types/ml.js";

function tokenizeDomain(domain: string): string[] {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!normalized) {
    return [];
  }

  const parts = normalized.split(".").filter(Boolean);
  const tokens = new Set<string>();
  tokens.add(`domain:${normalized}`);

  for (const part of parts) {
    tokens.add(`part:${part}`);

    for (let index = 0; index < part.length - 2; index += 1) {
      tokens.add(`tri:${part.slice(index, index + 3)}`);
    }
  }

  if (parts.length > 0) {
    tokens.add(`tld:${parts[parts.length - 1]}`);
  }

  return [...tokens];
}

function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

export class LogisticRegressionClassifier {
  private model: LogisticRegressionModel | null = null;
  private featureIndex = new Map<string, number>();
  private readonly enabled =
    process.env.ML_CLASSIFIER_ENABLED?.trim().toLowerCase() === "true";
  private readonly confidenceThreshold = Number(process.env.ML_CONFIDENCE_THRESHOLD ?? "0.7");

  constructor(private readonly modelPath: string) {}

  async init(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const raw = await readFile(this.modelPath, "utf8");
      const parsed = JSON.parse(raw) as LogisticRegressionModel;
      this.model = parsed;
      this.featureIndex = new Map(parsed.featureVocabulary.map((feature, index) => [feature, index]));
    } catch {
      this.model = null;
      this.featureIndex.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.model !== null;
  }

  predict(domain: string): MlCategoryPrediction | null {
    if (!this.model) {
      return null;
    }

    const tokens = tokenizeDomain(domain);
    if (tokens.length === 0) {
      return null;
    }

    const scores = this.model.biases.slice();
    for (const token of tokens) {
      const featurePosition = this.featureIndex.get(token);
      if (featurePosition === undefined) {
        continue;
      }

      for (let classIndex = 0; classIndex < this.model.labels.length; classIndex += 1) {
        scores[classIndex] += this.model.weights[classIndex][featurePosition] ?? 0;
      }
    }

    const probabilities = softmax(scores);
    let bestIndex = 0;
    let bestProbability = probabilities[0] ?? 0;

    for (let index = 1; index < probabilities.length; index += 1) {
      if (probabilities[index] > bestProbability) {
        bestProbability = probabilities[index];
        bestIndex = index;
      }
    }

    if (bestProbability < this.confidenceThreshold) {
      return null;
    }

    return {
      normalizedCategory: this.model.labels[bestIndex],
      confidence: Number(bestProbability.toFixed(4)),
      source: "ml-logreg"
    };
  }
}
