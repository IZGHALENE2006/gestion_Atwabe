const westernDigits = value => String(value || "").replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)));

// Local Moroccan numbers are accepted; other countries require their country code.
export function creditWhatsAppNumber(value) {
  let number = westernDigits(value).trim();
  if (!/^[+\d\s().-]+$/.test(number)) return "";
  number = number.replace(/[\s().-]/g, "");
  if (number.startsWith("00")) number = "+" + number.slice(2);
  if (/^0[567]\d{8}$/.test(number)) number = "212" + number.slice(1);
  number = number.replace(/^\+/, "");
  return /^[1-9]\d{7,14}$/.test(number) ? number : "";
}

export function creditEmailAddress(value) {
  const email = String(value || "").trim();
  // A single mailbox only: reject injected headers, extra recipients and URI syntax.
  return email.length <= 254 && /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(email) ? email : "";
}

export function creditWhatsAppUrl(phone, text) {
  const number = creditWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : "";
}

export function creditEmailUrl(email, subject, body) {
  const address = creditEmailAddress(email);
  return address ? `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}` : "";
}

export function creditStatementFilename(reference) {
  return `credit_${String(reference || "statement").replace(/[^a-z\d_-]/gi, "_").slice(0, 100)}.pdf`;
}

export function canShareCreditFile(navigator, file) {
  try { return Boolean(file && navigator?.share && navigator?.canShare?.({ files: [file] })); }
  catch { return false; }
}
