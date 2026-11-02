import { useTranslation } from "react-i18next";
export default function DjellabaCostBreakdown({ costs, meters, garmentType = "djellaba" }) {
  const { t, i18n } = useTranslation();
  const costText = key => t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const money = value => value === null || value === undefined ? "—" : Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className="fesla-cost-breakdown" aria-label={costText("breakdown")} data-djellaba-costs>
    <h4>{costText("breakdown")}</h4>
    {costs && <p className="fesla-fabric-equation"><bdi>{Number(meters).toLocaleString(locale, { maximumFractionDigits: 3 })} {costText("metersUnit")} × {money(costs.fabricUnitPrice)} {t("fesla.currency")} = {money(costs.fabricAmount)} {t("fesla.currency")}</bdi></p>}
    <dl>{["fabricAmount", "sfifaAmount", "laborAmount", "totalAmount"].map(key => <div key={key}><dt>{costText(key)}</dt><dd data-garment-cost={key} data-value={costs?.[key] ?? ""}><bdi>{money(costs?.[key])} {t("fesla.currency")}</bdi></dd></div>)}</dl>
  </section>;
}
