import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCameraOutline, IoImageOutline, IoTrashOutline } from "react-icons/io5";
import TailoringPhoto from "./TailoringPhoto.jsx";

export default function TailoringPhotoField({ selection, onSelect, onRemove, onCameraBusy, order, item, token, removed, disabled }) {
  const { t } = useTranslation();
  const fileRef = useRef(null), videoRef = useRef(null), streamRef = useRef(null), mountedRef = useRef(false), cameraBusyRef = useRef(false);
  const [camera, setCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const stop = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stop(); }; }, []);
  useEffect(() => () => { if (selection?.preview) URL.revokeObjectURL(selection.preview); }, [selection]);
  useEffect(() => {
    if (camera && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => { if (mountedRef.current) { stop(); setCamera(false); onCameraBusy(false); setError("cameraUnavailable"); } });
    }
  }, [camera, onCameraBusy]);
  const choose = (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("imageTypeInvalid"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("imageTooLarge"); return; }
    setError("");
    onSelect({ file, preview: URL.createObjectURL(file) });
  };
  const openCamera = async () => {
    if (cameraBusyRef.current || disabled) return;
    cameraBusyRef.current = true;
    setStarting(true); setError(""); onCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream; setCamera(true);
    } catch { if (mountedRef.current) { setError("cameraUnavailable"); onCameraBusy(false); } }
    finally { cameraBusyRef.current = false; if (mountedRef.current) setStarting(false); }
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight || disabled) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob || !mountedRef.current) return;
      choose(new File([blob], "fabric-photo.jpg", { type: "image/jpeg" }));
      stop(); setCamera(false); onCameraBusy(false);
    }, "image/jpeg", 0.85);
  };
  const savedPhoto = item || order;
  const hasPhoto = selection || (savedPhoto?.hasPhoto && !removed);
  return <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
    <h3 className="mb-2 text-sm font-bold">{t("fesla.photo")}</h3><p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t("fesla.photoHint")}</p>
    {camera ? <div className="space-y-3"><video ref={videoRef} autoPlay muted playsInline aria-label={t("fesla.photoPreview")} className="max-h-64 w-full rounded-xl bg-slate-900" /><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={capture} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("fesla.capturePhoto")}</button><button type="button" disabled={disabled} onClick={() => { stop(); setCamera(false); onCameraBusy(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">{t("fesla.closeCamera")}</button></div></div>
      : <div className="flex flex-wrap items-center gap-3"><div className="w-28 shrink-0">{selection ? <img src={selection.preview} alt={t("fesla.photoPreview")} className="h-28 w-28 rounded-xl object-contain" /> : savedPhoto?.hasPhoto && !removed ? <TailoringPhoto order={order} item={item} token={token} className="h-28 w-28" /> : <div className="flex h-28 items-center justify-center rounded-xl bg-white text-slate-400 dark:bg-slate-900"><IoImageOutline size={32} /></div>}</div>
      <div className="flex flex-1 flex-wrap gap-2"><button type="button" disabled={disabled || starting} onClick={openCamera} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><IoCameraOutline size={20} />{t(starting ? "fesla.cameraStarting" : "fesla.takePhoto")}</button><button type="button" disabled={disabled || starting} onClick={() => fileRef.current.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600"><IoImageOutline size={20} />{t("fesla.choosePhoto")}</button>{hasPhoto && <button type="button" disabled={disabled || starting} onClick={() => { setError(""); onRemove(); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-600 dark:text-rose-400"><IoTrashOutline />{t("fesla.removePhoto")}</button>}</div></div>}
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={t("fesla.choosePhoto")} className="hidden" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{t(error === "cameraUnavailable" ? "fesla.cameraUnavailable" : `fesla.errors.${error}`)}</p>}
  </section>;
}
