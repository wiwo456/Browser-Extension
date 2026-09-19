import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const backendRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = join(backendRoot, "data");
const lookupPath = join(dataDir, "domain-category-lookup.json");
const outputPath = join(dataDir, "ml-domain-logreg-model.json");

const LABELS = [
  "adult",
  "entertainment",
  "gaming",
  "health",
  "learning",
  "news",
  "other",
  "shopping",
  "social",
  "work"
];

const MAX_EXAMPLES_PER_CATEGORY = 12000;
const MAX_FEATURES = 3500;
const EPOCHS = 6;
const LEARNING_RATE = 0.08;
const L2 = 0.0001;

function tokenizeDomain(domain) {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!normalized) {
    return [];
  }

  const parts = normalized.split(".").filter(Boolean);
  const tokens = new Set();
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

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

function sampleExamples(lookup) {
  const perCategory = new Map(LABELS.map((label) => [label, []]));
  const seenCounts = new Map(LABELS.map((label) => [label, 0]));

  for (const [domain, entry] of Object.entries(lookup)) {
    const label = entry?.normalizedCategory;
    if (!LABELS.includes(label)) {
      continue;
    }

    const examples = perCategory.get(label);
    const seen = (seenCounts.get(label) ?? 0) + 1;
    seenCounts.set(label, seen);

    const item = { domain, label };
    if (examples.length < MAX_EXAMPLES_PER_CATEGORY) {
      examples.push(item);
      continue;
    }

    const replacementIndex = Math.floor(Math.random() * seen);
    if (replacementIndex < MAX_EXAMPLES_PER_CATEGORY) {
      examples[replacementIndex] = item;
    }
  }

  return LABELS.flatMap((label) => perCategory.get(label) ?? []);
}

function buildVocabulary(examples) {
  const counts = new Map();

  for (const example of examples) {
    for (const token of tokenizeDomain(example.domain)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_FEATURES)
    .map(([token]) => token);
}

function featurizeExamples(examples, vocabulary) {
  const featureIndex = new Map(vocabulary.map((feature, index) => [feature, index]));
  return examples.map((example) => {
    const indices = [];
    for (const token of tokenizeDomain(example.domain)) {
      const index = featureIndex.get(token);
      if (index !== undefined) {
        indices.push(index);
      }
    }

    return {
      labelIndex: LABELS.indexOf(example.label),
      indices: [...new Set(indices)]
    };
  });
}

function trainModel(examples, vocabulary) {
  const featurized = featurizeExamples(examples, vocabulary);
  const classCount = LABELS.length;
  const featureCount = vocabulary.length;
  const weights = Array.from({ length: classCount }, () => Array(featureCount).fill(0));
  const biases = Array(classCount).fill(0);

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    for (let index = featurized.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [featurized[index], featurized[swapIndex]] = [featurized[swapIndex], featurized[index]];
    }

    for (const item of featurized) {
      const logits = biases.slice();
      for (const feature of item.indices) {
        for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
          logits[classIndex] += weights[classIndex][feature];
        }
      }

      const probabilities = softmax(logits);

      for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
        const expected = classIndex === item.labelIndex ? 1 : 0;
        const error = probabilities[classIndex] - expected;
        biases[classIndex] -= LEARNING_RATE * error;

        for (const feature of item.indices) {
          weights[classIndex][feature] -=
            LEARNING_RATE * (error + L2 * weights[classIndex][feature]);
        }
      }
    }
  }

  return {
    version: 1,
    labels: LABELS,
    featureVocabulary: vocabulary,
    weights,
    biases,
    metadata: {
      trainedAt: new Date().toISOString(),
      sampleCount: examples.length,
      epochs: EPOCHS,
      learningRate: LEARNING_RATE,
      maxExamplesPerCategory: MAX_EXAMPLES_PER_CATEGORY
    }
  };
}

async function main() {
  const raw = await readFile(lookupPath, "utf8");
  const payload = JSON.parse(raw);
  const examples = sampleExamples(payload.lookup ?? {});
  const vocabulary = buildVocabulary(examples);
  const model = trainModel(examples, vocabulary);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(model), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        sampleCount: model.metadata.sampleCount,
        featureCount: model.featureVocabulary.length,
        labels: model.labels
      },
      null,
      2
    )
  );
}

void main();
