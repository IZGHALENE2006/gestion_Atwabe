import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoImageOutline } from "react-icons/io5";
import { loadTailoringPhoto } from "./feslaApi.js";

export default function TailoringPhoto({ order, item, token, className = "h-48 w-full" }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const hasPhoto = (item || order).hasPhoto;
  const id = `${order._id}:${item?.lineId || ""}`;
  const state = result?.id === id && result.version === order.__v && result.token === token && result.attempt === attempt ? result : null;
  useEffect(() => {
    if (!hasPhoto) return;
    const controller = new AbortController();
    let url;
    loadTailoringPhoto(order, token, controller.signal, item?.lineId).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ id, version: order.__v, token, attempt, src: url, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ id, version: order.__v, token, attempt, error: true });
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [order, item, token, attempt, id, hasPhoto]);
  return <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 ${className}`}>
    {!hasPhoto ? <IoImageOutline size={32} aria-hidden="true" /> : state?.src ? <a href={state.src} target="_blank" rel="noopener noreferrer" aria-label={t("fesla.photoPreview")} className="h-full w-full"><img src={state.src} alt={t("fesla.photoPreview")} className="h-full w-full object-contain" /></a>
      : state?.error ? <div role="alert" className="p-3 text-center text-xs text-rose-600 dark:text-rose-400"><p>{t("fesla.errors.imageLoadFailed")}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 font-bold underline">{t("fesla.retry")}</button></div> : <p role="status" className="text-xs">{t("common.loading")}</p>}
  </div>;
}
