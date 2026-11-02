import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/fabrics`;
export const loadFabrics = async (token, signal) => (await axios.get(api, { headers: { Authorization: `Bearer ${token}` }, signal })).data;
export const saveFabric = async (fabric, token, id, version, { file, removePhoto = false } = {}) => {
  const options = { headers: { Authorization: `Bearer ${token}` } };
  let body = { ...fabric, ...(id ? { version } : {}), ...(removePhoto ? { removePhoto: true } : {}) };
  if (file) {
    const form = new FormData();
    form.append("data", JSON.stringify(body));
    form.append("image", file);
    body = form;
  }
  return (id
    ? await axios.put(`${api}/${encodeURIComponent(id)}`, body, options)
    : await axios.post(api, body, options)).data;
};

export const removeFabricEntry = async ({ fabric, color, piece }, token) => {
  const suffix = color ? `/colors/${encodeURIComponent(color._id)}${piece ? `/pieces/${encodeURIComponent(piece._id)}` : ""}` : "";
  return (await axios.delete(`${api}/${encodeURIComponent(fabric._id)}${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { version: fabric.__v },
  })).data;
};

export const reduceFabricPiece = async ({ fabric, color, piece }, meters, requestId, token) => (
  await axios.post(`${api}/${encodeURIComponent(fabric._id)}/colors/${encodeURIComponent(color._id)}/pieces/${encodeURIComponent(piece._id)}/reductions`, {
    meters, barcode: piece.barcode, version: fabric.__v, requestId,
  }, { headers: { Authorization: `Bearer ${token}` } })
).data;

export const loadFabricMovements = async (token, { barcode = "", offset = 0, signal } = {}) => (
  await axios.get(`${api}/movements`, { params: { barcode, offset }, headers: { Authorization: `Bearer ${token}` }, signal })
).data;

export const loadFabricPhoto = async (id, token, signal) => (
  await axios.get(`${api}/${encodeURIComponent(id)}/photo`, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob", signal })
).data;
