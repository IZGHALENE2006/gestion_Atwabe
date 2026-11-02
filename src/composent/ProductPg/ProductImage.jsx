import { useState } from 'react';
import { IoImageOutline } from 'react-icons/io5';
import { productImageUrl } from './productImageUtils';

export default function ProductImage({ image, name, className = '', contain = false }) {
  const src = productImageUrl(image);
  const [failedSrc, setFailedSrc] = useState(null);
  return (
    <div className={`overflow-hidden bg-slate-50 dark:bg-slate-800 ${className}`}>
      {src && src !== failedSrc ? (
        <img src={src} alt={name || ''} loading="lazy" className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'}`} onError={() => setFailedSrc(src)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary-50 text-primary-300 dark:bg-primary-500/5 dark:text-primary-800" aria-hidden="true">
          <IoImageOutline className="h-1/3 w-1/3 max-h-16 max-w-16" />
        </div>
      )}
    </div>
  );
}
