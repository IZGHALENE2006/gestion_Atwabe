import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoImageOutline } from "react-icons/io5";
import { loadFabricPhoto } from "./fabricsApi.js";

export default function FabricPhoto({ fabric, token, className = "h-24 w-24" }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const { _id: id, __v: version, hasPhoto, type } = fabric;
  const state = result?.id === id && result.version === version && result.token === token && result.attempt === attempt ? result : null;
  useEffect(() => {
    if (!hasPhoto) return;
    const controller = new AbortController();
    let url;
    loadFabricPhoto(id, token, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ id, version, token, attempt, src: url });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ id, version, token, attempt, error: true });
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, version, hasPhoto, token, attempt]);
  return <div data-fabric-photo className={"flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 " + className}>
    {!hasPhoto ? <IoImageOutline size={30} aria-hidden="true" /> : state?.src ? <a href={state.src} target="_blank" rel="noopener noreferrer" aria-label={t("fabrics.photoPreview", { type })} title={t("fabrics.enlargePhoto")} className="h-full w-full"><img src={state.src} alt={t("fabrics.photoPreview", { type })} className="h-full w-full object-contain" /></a>
      : state?.error ? <button type="button" onClick={() => setAttempt(value => value + 1)} title={t("fabrics.errors.imageLoadFailed")} aria-label={t("fabrics.retryPhoto")} className="h-full w-full px-2 text-xs font-semibold text-rose-600 underline dark:text-rose-400">{t("fabrics.retryPhoto")}</button> : <span role="status" className="text-xs">{t("common.loading")}</span>}
  </div>;
}
