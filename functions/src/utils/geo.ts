/**
 * Shared geographic utilities.
 * Previously duplicated across collectBike, returnBike, and reportCollectionIssue.
 */

// Malaysia bounding box
const MY_LAT_MIN = 0.8;
const MY_LAT_MAX = 7.5;
const MY_LNG_MIN = 99.5;
const MY_LNG_MAX = 119.5;

/**
 * Returns true if the given coordinates fall within the Malaysia bounding box.
 * Used as a coarse sanity-check before the precise Haversine station-radius check.
 */
export function isValidMalaysiaCoords(lat: number, lng: number): boolean {
  return (
    lat >= MY_LAT_MIN &&
    lat <= MY_LAT_MAX &&
    lng >= MY_LNG_MIN &&
    lng <= MY_LNG_MAX
  );
}
