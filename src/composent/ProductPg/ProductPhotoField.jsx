import { useEffect, useId, useState } from 'react';
import { IoImageOutline, IoTrashOutline } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import { productImageUrl } from './productImageUtils';

export default function ProductPhotoField({ selection, onSelect, currentImage = '', onRemove, disabled = false }) {
  const { t } = useTranslation();
  const id = useId();
  const [error, setError] = useState('');
  const preview = selection?.preview || productImageUrl(currentImage);

  useEffect(() => () => {
    if (selection?.preview) URL.revokeObjectURL(selection.preview);
  }, [selection]);

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('imageTypeInvalid');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('imageTooLarge');
      return;
    }
    setError('');
    onSelect({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <label htmlFor={id} className="mb-3 block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('productPhoto.label')}</label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-primary-400 dark:border-slate-700 dark:bg-slate-900">
          {preview ? <img src={preview} alt={t('productPhoto.preview')} className="h-full w-full object-contain" /> : <IoImageOutline size={32} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input id={id} type="file" name="image" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={disabled} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className="block w-full min-w-0 text-xs text-slate-600 file:me-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary-100 file:px-3 file:py-2 file:font-semibold file:text-primary-700 dark:text-slate-300 dark:file:bg-primary-500/15 dark:file:text-primary-400" />
          <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-400">{t('productPhoto.hint')}</p>
          {selection && <p className="break-all text-xs text-slate-500">{selection.file.name}</p>}
          {preview && <button type="button" disabled={disabled} onClick={() => { setError(''); onRemove(); }} className="flex items-center gap-1 text-xs font-semibold text-rose-500 disabled:opacity-50"><IoTrashOutline aria-hidden="true" />{t('productPhoto.remove')}</button>}
        </div>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-3 text-sm text-rose-500">{t(`productPhoto.${error}`)}</p>}
    </div>
  );
}
