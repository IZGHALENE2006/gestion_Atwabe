import { useTranslation } from "react-i18next";
import { tailoringFabricMeters } from "../../../shared/tailoring.js";
export default function TrouserFabricCost({ cost, meters }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const money = value => Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className="fesla-cost-breakdown" aria-label={t("fesla.costs.fabricAmount")} data-trouser-fabric-costs={cost?.fabricAmount ?? ""}>
    <h4>{t("fesla.costs.fabricAmount")}</h4>
    <p className="fesla-fabric-equation">{cost ? <bdi>{tailoringFabricMeters(meters)?.toLocaleString(locale, { maximumFractionDigits: 3 })} {t("fesla.costs.metersUnit")} × {money(cost.fabricUnitPrice)} {t("fesla.currency")} = {money(cost.fabricAmount)} {t("fesla.currency")}</bdi> : "—"}</p>
  </section>;
}
