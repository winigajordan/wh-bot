export function normalizeZoneText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchZoneInAddress(
  zoneName: string,
  addressText: string,
): boolean {
  const zone = normalizeZoneText(zoneName);
  const address = normalizeZoneText(addressText);

  if (!zone || !address) {
    return false;
  }

  if (address === zone) {
    return true;
  }

  return address.includes(zone);
}
