export function formatBrl(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("Centavos precisam ser inteiros.");
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const cent = abs % 100;
  const reaisFmt = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${reaisFmt},${cent.toString().padStart(2, "0")}`;
}
