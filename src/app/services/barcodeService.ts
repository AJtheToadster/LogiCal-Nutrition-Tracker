export interface ScannedProduct {
  barcode: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  servingWeightGrams?: number;
  imageUrl?: string;
  source: "openfoodfacts" | "local_database";
}

export interface DemoBarcode {
  barcode: string;
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  category: string;
  imageUrl?: string;
}

export const DEMO_BARCODES: DemoBarcode[] = [
  {
    barcode: "0888849000043",
    name: "Chocolate Chip Cookie Dough Protein Bar",
    brand: "Quest Nutrition",
    calories: 200,
    protein: 21,
    carbs: 22,
    fat: 7,
    servingSize: "1 bar (60g)",
    category: "Protein Snack",
    imageUrl: "https://images.openfoodfacts.org/images/products/088/884/900/0043/front_en.11.200.jpg",
  },
  {
    barcode: "5201051000854",
    name: "Total 2% Plain Greek Strained Yogurt",
    brand: "FAGE",
    calories: 140,
    protein: 17,
    carbs: 6,
    fat: 4,
    servingSize: "1 cup (170g)",
    category: "Dairy",
    imageUrl: "https://images.openfoodfacts.org/images/products/520/105/100/0854/front_en.35.200.jpg",
  },
  {
    barcode: "0811620021616",
    name: "2% Reduced Fat Ultra-Filtered Milk",
    brand: "Fairlife",
    calories: 120,
    protein: 13,
    carbs: 6,
    fat: 5,
    servingSize: "1 cup (240ml)",
    category: "Beverage",
    imageUrl: "https://images.openfoodfacts.org/images/products/081/162/002/1616/front_en.21.200.jpg",
  },
  {
    barcode: "0030000010404",
    name: "Old Fashioned Rolled Oats 100% Whole Grain",
    brand: "Quaker",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    servingSize: "1/2 cup dry (40g)",
    category: "Grains",
    imageUrl: "https://images.openfoodfacts.org/images/products/003/000/001/0404/front_en.16.200.jpg",
  },
  {
    barcode: "0096619223308",
    name: "Wild Albacore Tuna in Water",
    brand: "Kirkland Signature",
    calories: 130,
    protein: 30,
    carbs: 0,
    fat: 1,
    servingSize: "1 can drained (140g)",
    category: "Seafood",
  },
  {
    barcode: "0049000042566",
    name: "Zero Sugar Soda",
    brand: "Coca-Cola",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    servingSize: "1 can (355ml)",
    category: "Beverage",
  },
];

/**
 * Fetch product nutritional info by barcode using the Open Food Facts API
 * with instant fallback to demo data if offline or unavailable.
 */
export async function lookupBarcode(barcode: string): Promise<ScannedProduct> {
  const cleanCode = barcode.trim().replace(/[^0-9]/g, "");

  // Check local demo cache first
  const localMatch = DEMO_BARCODES.find((d) => d.barcode === cleanCode);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LogiCalNutritionTracker - Web/iOS - version 1.0",
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};

        // Calculate calories per serving or per 100g
        const calories = Math.round(
          Number(n["energy-kcal_serving"]) ||
          Number(n["energy-kcal_100g"]) ||
          Number(n["energy-kcal"]) ||
          (Number(n["energy_serving"]) ? Number(n["energy_serving"]) / 4.184 : 0) ||
          0
        );

        const protein = Math.round(
          Number(n["proteins_serving"]) ||
          Number(n["proteins_100g"]) ||
          Number(n["proteins"]) ||
          0
        );

        const carbs = Math.round(
          Number(n["carbohydrates_serving"]) ||
          Number(n["carbohydrates_100g"]) ||
          Number(n["carbohydrates"]) ||
          0
        );

        const fat = Math.round(
          Number(n["fat_serving"]) ||
          Number(n["fat_100g"]) ||
          Number(n["fat"]) ||
          0
        );

        const servingSize = p.serving_size || p.quantity || "1 serving";
        const name = p.product_name || p.generic_name || `Scanned Item #${cleanCode}`;
        const brand = p.brands ? p.brands.split(",")[0].trim() : undefined;
        const imageUrl = p.image_front_url || p.image_small_url || localMatch?.imageUrl;

        return {
          barcode: cleanCode,
          name: brand ? `${brand} ${name}` : name,
          brand,
          calories,
          protein,
          carbs,
          fat,
          servingSize,
          imageUrl,
          source: "openfoodfacts",
        };
      }
    }
  } catch (err) {
    console.warn("Open Food Facts API fetch failed or timed out, checking local presets", err);
  }

  // Fallback to local match if found
  if (localMatch) {
    return {
      barcode: localMatch.barcode,
      name: `${localMatch.brand} ${localMatch.name}`,
      brand: localMatch.brand,
      calories: localMatch.calories,
      protein: localMatch.protein,
      carbs: localMatch.carbs,
      fat: localMatch.fat,
      servingSize: localMatch.servingSize,
      imageUrl: localMatch.imageUrl,
      source: "local_database",
    };
  }

  // Fallback if not found in API or local presets
  return {
    barcode: cleanCode,
    name: `Food Item (${cleanCode})`,
    calories: 150,
    protein: 10,
    carbs: 15,
    fat: 5,
    servingSize: "1 serving",
    source: "local_database",
  };
}

/**
 * Check if browser supports native BarcodeDetector API
 */
export function hasBarcodeDetectorSupport(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * Scan video element with native BarcodeDetector if available
 */
export async function scanVideoFrameWithBarcodeDetector(video: HTMLVideoElement): Promise<string | null> {
  if (!hasBarcodeDetectorSupport()) return null;
  try {
    // @ts-expect-error - BarcodeDetector is a modern web standard
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
    });
    const barcodes = await detector.detect(video);
    if (barcodes && barcodes.length > 0) {
      return barcodes[0].rawValue;
    }
  } catch (err) {
    console.debug("BarcodeDetector frame detection:", err);
  }
  return null;
}

