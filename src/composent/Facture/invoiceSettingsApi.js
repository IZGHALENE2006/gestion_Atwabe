import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/invoice-settings`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

export async function loadInvoiceSettings(signal) {
  return (await axios.get(api, { headers: headers(), signal })).data;
}

export async function saveInvoiceSettings(settings, logoFile, removeLogo) {
  const form = new FormData();
  form.append("settings", JSON.stringify(settings));
  if (logoFile) form.append("logo", logoFile);
  else if (removeLogo) form.append("removeLogo", "true");
  return (await axios.put(api, form, { headers: headers() })).data;
}
