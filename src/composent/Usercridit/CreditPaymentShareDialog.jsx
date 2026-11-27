import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { creditPaymentFilename, creditPaymentShareMessage } from '../../../shared/creditSharing.js';
import DocumentShareDialog from '../shared/DocumentShareDialog.jsx';
import { createCreditStatementPDF } from './creditStatementPDF.js';

export default function CreditPaymentShareDialog({ document, user, settings, onClose }) {
  const { t, i18n } = useTranslation(), rtl = i18n.dir() === 'rtl', locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const createDocument = useCallback(() => createCreditStatementPDF(document, settings, { t, rtl, locale }), [document, settings, t, rtl, locale]);
  return <DocumentShareDialog title={t('creditDocuments.share.paymentAction')} customer={{ ...document.customer, phone: user?.phone || document.customer?.phone || '' }} filename={creditPaymentFilename(document.reference)} initialMessage={creditPaymentShareMessage(document, { t, locale })} createDocument={createDocument} onClose={onClose} />;
}
