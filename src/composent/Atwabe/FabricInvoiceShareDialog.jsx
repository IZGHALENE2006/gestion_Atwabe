import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fabricInvoicePDFData } from '../../../shared/fabricInvoiceDocuments.js';
import { documentShareFilename, fabricInvoiceShareMessage } from '../../../shared/documentSharing.js';
import { useInvoiceSettings } from '../Facture/useInvoiceSettings.js';
import { createFacturePDF } from '../Facture/invoicePDF.js';
import DocumentShareDialog from '../shared/DocumentShareDialog.jsx';

export default function FabricInvoiceShareDialog({ invoice, onClose }) {
  const { t, i18n } = useTranslation(), { settings, loading, error, retry } = useInvoiceSettings();
  const createDocument = useCallback(() => createFacturePDF(fabricInvoicePDFData(invoice), settings), [invoice, settings]);
  return <DocumentShareDialog key={i18n.language} title={t('documentSharing.invoiceTitle')} customer={invoice.customer} filename={documentShareFilename(invoice.reference, 'fabric_invoice')} initialMessage={fabricInvoiceShareMessage(invoice, { t, locale: i18n.language === 'ar' ? 'ar-MA' : 'fr-MA' })} createDocument={createDocument} preparing={loading} preparationError={Boolean(error)} onRetryPreparation={retry} onClose={onClose} />;
}
