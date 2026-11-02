// Keep the client's French wording consistent in the form and documents.
export const PAYMENT_METHODS = [
  { value: "cheque_30_days", label: "Chèque à 30 jours" },
  { value: "on_account", label: "En compte" },
  { value: "cash", label: "Espèce" },
  { value: "direct_debit_25_days", label: "Prélèvement à 25 jours" },
  { value: "direct_debit_3_installments", label: "Prélèvement en 3 fois" },
  { value: "direct_debit_4_installments", label: "Prélèvement en 4 fois" },
  { value: "bill_of_exchange", label: "Lettre de change" },
  { value: "bank_transfer", label: "Virement" },
];

export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map(({ value }) => value);
export const getPaymentMethodLabel = (value) => PAYMENT_METHODS.find((method) => method.value === value)?.label || "";
