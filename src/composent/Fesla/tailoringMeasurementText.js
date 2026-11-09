import { TAILORING_MEASUREMENT_FIELDS } from "../../../shared/tailoringMeasurements.js";

export function tailoringMeasurementText(item, t) {
  if (item.measurementNotes !== undefined) return item.measurementNotes;
  return TAILORING_MEASUREMENT_FIELDS.filter(key => item.measurements?.[key] != null)
    .map(key => `${t("fesla.measurements.fields." + key)}: ${item.measurements[key]}`).join("\n");
}
