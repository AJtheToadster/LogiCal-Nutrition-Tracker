import { Capacitor } from "@capacitor/core";
import { FoodEntry, getDailyTotals, HealthSyncSettings } from "./storageService";

export interface HealthSyncResult {
  success: boolean;
  mode: "native_healthkit" | "apple_shortcut" | "export_file";
  message: string;
  syncedTimestamp: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface AppleHealthDataPayload {
  date: string;
  timestamp: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  appName: string;
  entriesCount: number;
}

/**
 * Detect if running in native iOS Capacitor container
 */
export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/**
 * Format payload for Apple Health sync
 */
export function buildHealthPayload(
  entries: FoodEntry[],
  dateKey: string,
  settings: HealthSyncSettings
): AppleHealthDataPayload {
  const totals = getDailyTotals(entries);

  return {
    date: dateKey,
    timestamp: new Date().toISOString(),
    calories: settings.syncCalories ? totals.calories : 0,
    protein: settings.syncProtein ? totals.protein : 0,
    carbohydrates: settings.syncCarbs ? totals.carbs : 0,
    fat: settings.syncFat ? totals.fat : 0,
    appName: "LogiCal Nutrition Tracker",
    entriesCount: entries.length,
  };
}

/**
 * Sync nutrition data with Apple Health
 * - If on native iOS (Capacitor), uses native HealthKit bridge
 * - If on web/simulator, launches the official Apple Shortcut deep-link
 */
export async function syncToAppleHealth(
  entries: FoodEntry[],
  dateKey: string,
  settings: HealthSyncSettings
): Promise<HealthSyncResult> {
  const payload = buildHealthPayload(entries, dateKey, settings);
  const now = Date.now();

  // Check if native iOS Capacitor HealthKit bridge exists
  if (isNativeIOS()) {
    try {
      // Check for native plugin bridge on window (e.g. CapacitorHealthkit)
      // @ts-expect-error - dynamic native bridge check
      const healthPlugin = window.Capacitor?.Plugins?.CapacitorHealthkit || window.CapacitorHealthkit;
      if (healthPlugin) {
        await healthPlugin.requestAuthorization({
          all: [],
          read: [],
          write: [
            "calories",
            "protein",
            "carbohydrates",
            "fat",
          ],
        });

        // Write quantity samples to HealthKit
        const dateIso = new Date().toISOString();
        if (settings.syncCalories && payload.calories > 0) {
          await healthPlugin.saveQuantitySample({
            sampleType: "calories",
            unit: "kcal",
            amount: payload.calories,
            startDate: dateIso,
            endDate: dateIso,
          });
        }
        if (settings.syncProtein && payload.protein > 0) {
          await healthPlugin.saveQuantitySample({
            sampleType: "protein",
            unit: "g",
            amount: payload.protein,
            startDate: dateIso,
            endDate: dateIso,
          });
        }
        if (settings.syncCarbs && payload.carbohydrates > 0) {
          await healthPlugin.saveQuantitySample({
            sampleType: "carbohydrates",
            unit: "g",
            amount: payload.carbohydrates,
            startDate: dateIso,
            endDate: dateIso,
          });
        }
        if (settings.syncFat && payload.fat > 0) {
          await healthPlugin.saveQuantitySample({
            sampleType: "fat",
            unit: "g",
            amount: payload.fat,
            startDate: dateIso,
            endDate: dateIso,
          });
        }

        return {
          success: true,
          mode: "native_healthkit",
          message: `Saved ${payload.calories} kcal & macros directly to Apple Health!`,
          syncedTimestamp: now,
          calories: payload.calories,
          protein: payload.protein,
          carbs: payload.carbohydrates,
          fat: payload.fat,
        };
      }
    } catch (err) {
      console.warn("Native HealthKit direct write failed, falling back to Apple Shortcut link", err);
    }
  }

  // Apple Shortcut deep-link for iOS / Web:
  // Launches shortcuts://run-shortcut?name=LogiCal%20Sync&input=text&text=<encoded_json>
  const jsonString = JSON.stringify(payload);
  const encodedData = encodeURIComponent(jsonString);
  const shortcutUrl = `shortcuts://run-shortcut?name=LogiCal%20Sync&input=text&text=${encodedData}`;

  // Attempt to open shortcut scheme
  try {
    const link = document.createElement("a");
    link.href = shortcutUrl;
    link.click();
  } catch (err) {
    console.debug("Failed opening shortcuts url directly", err);
  }

  return {
    success: true,
    mode: "apple_shortcut",
    message: `Triggered Apple Health sync for ${payload.calories} kcal (${payload.protein}P · ${payload.carbohydrates}C · ${payload.fat}F)`,
    syncedTimestamp: now,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbohydrates,
    fat: payload.fat,
  };
}

/**
 * Export logged entries as standard Apple Health CSV
 */
export function exportAppleHealthCSV(entries: FoodEntry[], dateKey: string): void {
  const totals = getDailyTotals(entries);
  const timestamp = `${dateKey} 12:00:00`;

  const rows = [
    ["type", "sourceName", "unit", "creationDate", "startDate", "endDate", "value"],
    ["HKQuantityTypeIdentifierDietaryEnergyConsumed", "LogiCal", "kcal", timestamp, timestamp, timestamp, totals.calories.toString()],
    ["HKQuantityTypeIdentifierDietaryProtein", "LogiCal", "g", timestamp, timestamp, timestamp, totals.protein.toString()],
    ["HKQuantityTypeIdentifierDietaryCarbohydrates", "LogiCal", "g", timestamp, timestamp, timestamp, totals.carbs.toString()],
    ["HKQuantityTypeIdentifierDietaryFatTotal", "LogiCal", "g", timestamp, timestamp, timestamp, totals.fat.toString()],
  ];

  const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `LogiCal_AppleHealth_${dateKey}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

