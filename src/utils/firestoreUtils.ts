/**
 * Recursively removes keys with `undefined` values from an object or array of objects.
 * Firestore JS SDK throws an error if `undefined` values are passed in `updateDoc`, `addDoc`, or `setDoc`.
 */
export function cleanUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedFields(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefinedFields(value);
      }
    }
    return cleaned as T;
  }

  return obj;
}
