import { useTranslation } from "react-i18next";
import { IoCutOutline, IoTimeOutline } from "react-icons/io5";
import { TAILORING_SFIFA_GARMENT_TYPES } from "../../../shared/tailoring.js";
import { workerWorkGarmentType, workerWorkTotals } from "../../../shared/workerWork.js";

export default function WorkerGarmentChoices({ works, onChoose }) {
  const { t, i18n } = useTranslation();
  const kinds = [...TAILORING_SFIFA_GARMENT_TYPES, ...(works.some(work => !workerWorkGarmentType(work)) ? ["legacy"] : [])];
  const number = value => Number(value).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA");
  return <section className="worker-garment-section" aria-labelledby="worker-garment-title"><h2 id="worker-garment-title">{t("workers.work.chooseGarmentType")}</h2><div className="worker-garment-grid">{kinds.map(kind => {
    const matching = works.filter(work => (workerWorkGarmentType(work) || "legacy") === kind), totals = workerWorkTotals(matching, "machine");
    return <button type="button" key={kind} data-work-garment={kind} className="worker-garment-card" onClick={() => onChoose(kind)}><span className="worker-garment-icon" aria-hidden="true">{kind === "legacy" ? <IoTimeOutline /> : <IoCutOutline />}</span><h3>{t(kind === "legacy" ? "workers.work.legacyGarments" : "fesla.garmentTypes." + kind)}</h3><dl>{["quantity", "completedQuantity", "remainingQuantity"].map(key => <div key={key}><dt>{t("workers.work.design." + key)}</dt><dd data-garment-work-total={key} data-value={totals[key]}>{number(totals[key])}</dd></div>)}</dl><small>{t("workers.work.workCount", { count: matching.length })}</small></button>;
  })}</div></section>;
}
