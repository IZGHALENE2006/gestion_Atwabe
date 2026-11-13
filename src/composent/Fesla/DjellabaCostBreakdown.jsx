import { djellabaItemSalePrice } from "../../../shared/tailoringCosts.js";
import { tailoringProfitAmount } from "../../../shared/tailoring.js";
import { useTranslation } from "react-i18next";
export default function DjellabaCostBreakdown({ showProfit = true, costs, meters, garmentType = "djellaba", pricingVersion = 1 }) {
  const { t, i18n } = useTranslation();
  const costText = key => t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const money = value => value === null || value === undefined ? "—" : Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valueFor = key => key === "saleAmount" ? djellabaItemSalePrice(costs) : key === "sfifaProfitAmount" ? tailoringProfitAmount(costs?.sfifaAmount, costs?.sfifaCostAmount) : costs?.[key];
  const fields = pricingVersion === 3 ? ["fabricAmount", "sfifaCostAmount", "sfifaAmount", "totalAmount", "sfifaProfitAmount", "saleAmount"] : pricingVersion === 2 ? ["fabricAmount", "sfifaAmount", "saleAmount"] : ["fabricAmount", "sfifaAmount", "laborAmount", "totalAmount"];
  return <section className="fesla-cost-breakdown" aria-label={pricingVersion >= 2 ? t("fesla.salePricing.breakdown") : costText("breakdown")} data-djellaba-costs>
    <h4>{pricingVersion >= 2 ? t("fesla.salePricing.breakdown") : costText("breakdown")}</h4>
    {costs && <p className="fesla-fabric-equation"><bdi>{Number(meters).toLocaleString(locale, { maximumFractionDigits: 3 })} {costText("metersUnit")} × {money(costs.fabricUnitPrice)} {t("fesla.currency")} = {money(costs.fabricAmount)} {t("fesla.currency")}</bdi></p>}
    <dl>{fields.filter(key => showProfit || !["sfifaProfitAmount", "sfifaCostAmount", "totalAmount"].includes(key)).map(key => <div key={key} className={key === "sfifaProfitAmount" ? "fesla-sfifa-profit" + (valueFor(key) < 0 ? " is-loss" : "") : undefined}><dt>{pricingVersion >= 2 ? t("fesla.salePricing." + key) : costText(key)}</dt><dd data-garment-cost={key} data-value={valueFor(key) ?? ""}><bdi>{money(valueFor(key))} {t("fesla.currency")}</bdi></dd></div>)}</dl>
  </section>;
}
