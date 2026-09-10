export interface ParsedFoodResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "exact_macros" | "parsed_ingredients" | "fallback_estimate";
  ingredients?: string[];
}

interface FoodDatabaseItem {
  keywords: string[];
  name: string;
  defaultServing: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
}

const COMMON_FOODS: FoodDatabaseItem[] = [
  { keywords: ["egg", "eggs"], name: "Large Egg", defaultServing: "1 egg", caloriesPerUnit: 70, proteinPerUnit: 6, carbsPerUnit: 0.5, fatPerUnit: 5 },
  { keywords: ["egg white", "egg whites"], name: "Egg Whites", defaultServing: "1/4 cup (60g)", caloriesPerUnit: 35, proteinPerUnit: 8, carbsPerUnit: 0.5, fatPerUnit: 0 },
  { keywords: ["sourdough", "toast", "bread", "slice of bread"], name: "Sourdough Toast", defaultServing: "1 slice (45g)", caloriesPerUnit: 120, proteinPerUnit: 4, carbsPerUnit: 24, fatPerUnit: 1 },
  { keywords: ["chicken", "chicken breast"], name: "Chicken Breast, grilled", defaultServing: "4 oz", caloriesPerUnit: 185, proteinPerUnit: 35, carbsPerUnit: 0, fatPerUnit: 4 },
  { keywords: ["rice", "brown rice", "white rice", "jasmine rice"], name: "Cooked Rice", defaultServing: "1 cup", caloriesPerUnit: 215, proteinPerUnit: 4.5, carbsPerUnit: 45, fatPerUnit: 1.5 },
  { keywords: ["salmon", "salmon fillet"], name: "Atlantic Salmon, baked", defaultServing: "5 oz", caloriesPerUnit: 290, proteinPerUnit: 40, carbsPerUnit: 0, fatPerUnit: 14 },
  { keywords: ["steak", "beef", "sirloin", "ground beef"], name: "Lean Sirloin Steak", defaultServing: "5 oz", caloriesPerUnit: 280, proteinPerUnit: 42, carbsPerUnit: 0, fatPerUnit: 12 },
  { keywords: ["sweet potato", "potato", "baked potato"], name: "Baked Sweet Potato", defaultServing: "1 medium (130g)", caloriesPerUnit: 115, proteinPerUnit: 2, carbsPerUnit: 27, fatPerUnit: 0.2 },
  { keywords: ["broccoli", "steamed broccoli"], name: "Steamed Broccoli", defaultServing: "1 cup", caloriesPerUnit: 50, proteinPerUnit: 4, carbsPerUnit: 10, fatPerUnit: 0.5 },
  { keywords: ["avocado"], name: "Avocado", defaultServing: "1/2 avocado", caloriesPerUnit: 160, proteinPerUnit: 2, carbsPerUnit: 8, fatPerUnit: 15 },
  { keywords: ["greek yogurt", "yogurt", "fage"], name: "Greek Yogurt (Plain 2%)", defaultServing: "1 cup (170g)", caloriesPerUnit: 140, proteinPerUnit: 18, carbsPerUnit: 6, fatPerUnit: 4 },
  { keywords: ["protein shake", "whey", "protein powder"], name: "Whey Protein Shake", defaultServing: "1 scoop in water", caloriesPerUnit: 130, proteinPerUnit: 25, carbsPerUnit: 3, fatPerUnit: 1.5 },
  { keywords: ["oatmeal", "oats", "rolled oats"], name: "Rolled Oatmeal", defaultServing: "1/2 cup dry (40g)", caloriesPerUnit: 150, proteinPerUnit: 5, carbsPerUnit: 27, fatPerUnit: 3 },
  { keywords: ["banana"], name: "Fresh Banana", defaultServing: "1 medium", caloriesPerUnit: 105, proteinPerUnit: 1.3, carbsPerUnit: 27, fatPerUnit: 0.3 },
  { keywords: ["apple"], name: "Fresh Apple", defaultServing: "1 medium", caloriesPerUnit: 95, proteinPerUnit: 0.5, carbsPerUnit: 25, fatPerUnit: 0.3 },
  { keywords: ["peanut butter", "almond butter"], name: "Peanut Butter", defaultServing: "2 tbsp (32g)", caloriesPerUnit: 190, proteinPerUnit: 8, carbsPerUnit: 7, fatPerUnit: 16 },
  { keywords: ["milk", "whole milk", "almond milk"], name: "Milk", defaultServing: "1 cup (240ml)", caloriesPerUnit: 120, proteinPerUnit: 8, carbsPerUnit: 12, fatPerUnit: 5 },
  { keywords: ["coffee", "cold brew", "espresso"], name: "Black Coffee / Cold Brew", defaultServing: "12 oz", caloriesPerUnit: 5, proteinPerUnit: 0, carbsPerUnit: 1, fatPerUnit: 0 },
  { keywords: ["tuna", "canned tuna"], name: "Canned Tuna in Water", defaultServing: "1 can (140g)", caloriesPerUnit: 130, proteinPerUnit: 30, carbsPerUnit: 0, fatPerUnit: 1 },
];

/**
 * Check if the text contains direct macro shorthand like:
 * "500 cal 40p 50c 10f" or "400 kcal 30p" or "350 calories"
 */
function tryParseDirectMacros(input: string): ParsedFoodResult | null {
  const text = input.toLowerCase();

  // Pattern: looks for cal/kcal, p/protein, c/carb/carbs, f/fat
  const calMatch = text.match(/(\d+)\s*(?:cal(?:ories)?|cals|kcal)\b/i);
  const pMatch = text.match(/(\d+)\s*(?:g\s*protein|protein|pro|p)\b/i);
  const cMatch = text.match(/(\d+)\s*(?:g\s*carbs?|carbs?|c(?![a-z]))\b/i);
  const fMatch = text.match(/(\d+)\s*(?:g\s*fat|fats?|f(?![a-z]))\b/i);

  if (calMatch || (pMatch && (cMatch || fMatch))) {
    let calories = calMatch ? parseInt(calMatch[1], 10) : 0;
    const protein = pMatch ? parseInt(pMatch[1], 10) : 0;
    const carbs = cMatch ? parseInt(cMatch[1], 10) : 0;
    const fat = fMatch ? parseInt(fMatch[1], 10) : 0;

    if (calories === 0 && (protein > 0 || carbs > 0 || fat > 0)) {
      calories = protein * 4 + carbs * 4 + fat * 9;
    }

    // Clean food name by removing the macro numbers
    const cleanName = input
      .replace(/(\d+)\s*(?:cal(?:ories)?|cals|kcal)\b/gi, "")
      .replace(/(\d+)\s*(?:g\s*protein|protein|pro|p)\b/gi, "")
      .replace(/(\d+)\s*(?:g\s*carbs?|carbs?|c(?![a-z]))\b/gi, "")
      .replace(/(\d+)\s*(?:g\s*fat|fats?|f(?![a-z]))\b/gi, "")
      .trim();

    return {
      name: cleanName || "Quick Macro Entry",
      calories,
      protein,
      carbs,
      fat,
      confidence: "exact_macros",
    };
  }

  return null;
}

/**
 * Parse natural language strings like:
 * "3 eggs and sourdough toast" or "chicken breast with rice"
 */
export function parseFoodNaturalLanguage(input: string): ParsedFoodResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      name: "Meal Entry",
      calories: 200,
      protein: 15,
      carbs: 20,
      fat: 6,
      confidence: "fallback_estimate",
    };
  }

  // 1. Try direct macro shorthand first
  const direct = tryParseDirectMacros(trimmed);
  if (direct) return direct;

  // 2. Parse natural language phrases
  // Split by connectors: "and", "with", "+", "&", ","
  const segments = trimmed
    .split(/\b(?:and|with|\+|&|,)\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  const matchedNames: string[] = [];

  for (const seg of segments) {
    // Extract leading quantity number (e.g. "3 eggs" -> qty 3; "6oz" -> 1.5; etc.)
    let qty = 1;
    const numMatch = seg.match(/^(\d+(?:\.\d+)?)\s*(?:oz|cups?|tbsp|g)?/i);
    if (numMatch) {
      const parsedNum = parseFloat(numMatch[1]);
      if (parsedNum > 0 && parsedNum <= 20) {
        qty = parsedNum;
      } else if (parsedNum > 20 && parsedNum <= 500) {
        // likely grams or calories
        qty = parsedNum / 100;
      }
    }

    // Match against food database
    let found = false;
    const lowerSeg = seg.toLowerCase();

    for (const food of COMMON_FOODS) {
      if (food.keywords.some((kw) => lowerSeg.includes(kw))) {
        totalCalories += Math.round(food.caloriesPerUnit * qty);
        totalProtein += Math.round(food.proteinPerUnit * qty);
        totalCarbs += Math.round(food.carbsPerUnit * qty);
        totalFat += Math.round(food.fatPerUnit * qty);
        matchedNames.push(food.name);
        found = true;
        break;
      }
    }

    if (!found) {
      // Default estimation for unknown segment
      totalCalories += 150;
      totalProtein += 10;
      totalCarbs += 15;
      totalFat += 5;
    }
  }

  const displayName =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  return {
    name: displayName,
    calories: Math.max(totalCalories, 50),
    protein: totalProtein,
    carbs: totalCarbs,
    fat: totalFat,
    confidence: matchedNames.length > 0 ? "parsed_ingredients" : "fallback_estimate",
    ingredients: matchedNames,
  };
}
