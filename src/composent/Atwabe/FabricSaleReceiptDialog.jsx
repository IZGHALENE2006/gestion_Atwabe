import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { IoCloseOutline, IoPrintOutline } from 'react-icons/io5';
import { documentPrintFonts } from '../../utils/documentFonts.js';
import { useInvoiceSettings } from '../Facture/useInvoiceSettings.js';
import FabricSaleReceiptPaper from './FabricSaleReceiptPaper.jsx';
import printStyles from '../Fesla/tailoringReceipts.css?inline';

export default function FabricSaleReceiptDialog({ movement, onClose }) {
  const { t, i18n } = useTranslation();
  const dialog = useRef(null), paper = useRef(null);
  const { settings, loading, error, retry } = useInvoiceSettings();
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState(false);
  const print = useReactToPrint({ contentRef: paper, fonts: documentPrintFonts, ignoreGlobalStyles: true, documentTitle: 'FB-' + movement._id,
    pageStyle: `@page { size: A4; margin: 12mm; } ${printStyles}`,
    onBeforePrint: async () => { await document.fonts.ready; },
    onAfterPrint: () => setPrinting(false), onPrintError: () => { setPrinting(false); setPrintError(true); },
  });
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const close = () => { if (!printing) { dialog.current.close(); onClose(); } };
  return <dialog ref={dialog} className="tailoring-receipt-dialog" dir={i18n.dir()} aria-labelledby="fabric-sale-receipt-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="fabric-sale-receipt-title">{t(movement.source === 'tailoring' ? 'fabrics.profits.tailoringReceiptTitle' : 'fabrics.sales.receiptTitle')}</h2><p>{t('fesla.receipts.previewHint')}</p></div><button type="button" data-close-fabric-receipt disabled={printing} onClick={close} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="tailoring-receipt-body">{loading && <p role="status">{t('common.loading')}</p>}{error && <p role="status">{t('fesla.receipts.settingsFallback')} <button type="button" onClick={retry}>{t('fabrics.retry')}</button></p>}{printError && <p role="alert" className="tailoring-receipt-error">{t('fabrics.errors.printFailed')}</p>}
      <div className="tailoring-receipt-preview"><FabricSaleReceiptPaper movement={movement} settings={settings} paperRef={paper} /></div>
    </div><footer><button type="button" disabled={printing} onClick={close}>{t('dialog.close')}</button><button type="button" data-print-fabric-receipt disabled={loading || printing} onClick={() => { setPrintError(false); setPrinting(true); print(); }}><IoPrintOutline size={20} />{t(printing ? 'fesla.receipts.printing' : 'fesla.receipts.print')}</button></footer>
  </dialog>;
}
