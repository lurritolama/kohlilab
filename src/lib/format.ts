/** Rappen -> "CHF 12.00" (de-CH). Serverseitig für Mail/Rechnung genutzt. */
export function formatPreis(rappen: number): string {
  return (
    'CHF ' +
    new Intl.NumberFormat('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rappen / 100)
  );
}
