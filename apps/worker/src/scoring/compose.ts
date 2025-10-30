/**
 * Compose multiple scoring factors into a weighted final score
 */

/**
 * Combine scores using weighted average
 * @param parts - Object with named scores (0-100)
 * @param weights - Corresponding weights for each part
 * @returns Final weighted score (0-100)
 */
export function composeScore(
  parts: Record<string, number>,
  weights: Record<string, number>
): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  
  if (totalWeight === 0) return 0;
  
  const weightedSum = Object.entries(parts).reduce((acc, [key, value]) => {
    const weight = weights[key] ?? 0;
    return acc + value * weight;
  }, 0);
  
  return Math.round(weightedSum / totalWeight);
}

/**
 * Helper to create a weighted composition
 * Usage:
 *   weighted()
 *     .add('ivr', ivrScore, 0.30)
 *     .add('delta', deltaScore, 0.25)
 *     .compute()
 */
export class WeightedScore {
  private parts: Record<string, number> = {};
  private weights: Record<string, number> = {};
  
  add(name: string, score: number, weight: number): WeightedScore {
    this.parts[name] = score;
    this.weights[name] = weight;
    return this;
  }
  
  compute(): number {
    return composeScore(this.parts, this.weights);
  }
}

/**
 * Factory function for creating weighted scores
 */
export function weighted(): WeightedScore {
  return new WeightedScore();
}

