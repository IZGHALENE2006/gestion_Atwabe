import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoImageOutline, IoTrashOutline } from "react-icons/io5";
import FabricPhoto from "./FabricPhoto.jsx";

export default function FabricPhotoField({ fabric, token, selection, removed, onSelect, onRemove, disabled }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => () => { if (selection?.preview) URL.revokeObjectURL(selection.preview); }, [selection]);
  const choose = file => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("imageTypeInvalid"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("imageTooLarge"); return; }
    setError("");
    onSelect({ file, preview: URL.createObjectURL(file) });
  };
  const hasPhoto = Boolean(selection || (fabric?.hasPhoto && !removed));
  return <section data-fabric-photo-field aria-labelledby="fabric-photo-label" className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
    <h3 id="fabric-photo-label" className="mb-3 text-sm font-bold">{t("fabrics.photo")} <span className="font-normal text-slate-500 dark:text-slate-400">({t("fabrics.optional")})</span></h3>
    <div className="flex flex-wrap items-center gap-4">
      {selection ? <img data-fabric-photo-preview src={selection.preview} alt={t("fabrics.selectedPhoto")} className="h-24 w-24 rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-700" /> : fabric?.hasPhoto && !removed ? <FabricPhoto fabric={fabric} token={token} /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-white text-blue-400 dark:bg-slate-900"><IoImageOutline size={32} aria-hidden="true" /></div>}
      <div className="min-w-0 flex-1 space-y-3"><p id="fabric-photo-hint" className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t("fabrics.photoHint")}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={() => inputRef.current.click()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><IoImageOutline size={19} />{t(hasPhoto ? "fabrics.changePhoto" : "fabrics.choosePhoto")}</button>{hasPhoto && <button type="button" disabled={disabled} onClick={() => { setError(""); onRemove(); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"><IoTrashOutline size={18} />{t("fabrics.removePhoto")}</button>}</div></div>
    </div>
    <input ref={inputRef} id="fabric-photo-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={t("fabrics.choosePhoto")} aria-describedby="fabric-photo-hint" className="hidden" onChange={event => { choose(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{t("fabrics.errors." + error)}</p>}
  </section>;
}
