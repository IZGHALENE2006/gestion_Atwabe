export const SALES_DOCUMENT_TYPES = ["invoice", "quote", "delivery", "return", "credit"];
export const NON_INVOICE_DOCUMENT_TYPES = ["quote", "delivery", "return", "credit"];
export const STOCK_DOCUMENT_TYPES = ["delivery", "return"];
export const DOCUMENT_PREFIXES = { quote: "DEV", delivery: "BL", return: "BR", credit: "AV" };

export const isStockNote = (document) => STOCK_DOCUMENT_TYPES.includes(document?.documentType);
export const isSalesDocument = (document) => NON_INVOICE_DOCUMENT_TYPES.includes(document?.documentType);
export const documentTypeOf = (document) => isSalesDocument(document) ? document.documentType : "invoice";
export const documentTitleKey = (document) => isSalesDocument(document)
  ? `salesDocuments.printTitles.${document.documentType}`
  : "salesPdf.invoiceTitle";
export const documentReference = (document) => document?.reference || document?._id || "—";

// Stock and totals retain positive quantities; returns use a minus sign on the document.
export const documentQuantity = (document, quantity) => String(document?.documentType === "return" ? -Math.abs(Number(quantity)) : quantity);

export function filterSalesDocuments(documents, type = "all") {
  return type === "all" ? documents : documents.filter((document) => documentTypeOf(document) === type);
}
