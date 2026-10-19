/** Click-to-chat link (opens WhatsApp; nothing is sent automatically). Moroccan numbers default to +212. */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `212${d.slice(1)}`;
  if (d.length < 9 || d.length > 15) return null;
  return `https://wa.me/${d}`;
}
