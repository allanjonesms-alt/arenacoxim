export function normalizePhoneNumber(phone: string): string | undefined {
  if (!phone) return undefined;
  
  // Remove all non-numeric characters
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!cleanPhone) return undefined;

  // If it already starts with +, assume it has country code and just return it (after cleaning)
  if (phone.startsWith('+')) {
    return '+' + cleanPhone;
  }

  // If it has 10 or 11 digits (Brazilian format with or without 9), prepend +55
  if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
    return '+55' + cleanPhone;
  }

  // Otherwise, just prepend + if it looks like it might have a country code but no +
  // This is a bit risky but E.164 requires +
  if (cleanPhone.length > 11) {
    return '+' + cleanPhone;
  }

  // For very short numbers, it might be invalid anyway, but let's try to return something E.164-ish
  return '+' + cleanPhone;
}
