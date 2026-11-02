export function productImageUrl(image) {
  if (!image?.startsWith('/uploads/products/')) return '';
  return new URL(image, import.meta.env.VITE_API_URL || 'http://localhost:7000').href;
}

export function productFormData(data, imageFile, removeImage = false) {
  const payload = new FormData();
  for (const [key, rawValue] of Object.entries(data)) {
    if (rawValue == null || key === 'image') continue;
    const value = key === 'categorie' && typeof rawValue === 'object' ? rawValue._id : rawValue;
    const field = key === 'prix_vente' ? 'prix_vente_base' : key === 'prix_gros' ? 'prix_gros_base' : key;
    payload.append(field, value instanceof Date ? value.toISOString() : String(value));
  }
  if (imageFile) payload.append('image', imageFile);
  else if (removeImage) payload.append('removeImage', 'true');
  return payload;
}
