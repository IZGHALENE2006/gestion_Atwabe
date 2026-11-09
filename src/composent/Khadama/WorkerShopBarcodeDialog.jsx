import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';
import { IoCloseOutline, IoPrintOutline } from 'react-icons/io5';
import { shopPieceBarcode } from '../../../shared/workerShopFlow.js';
export default function WorkerShopBarcodeDialog({ work, worker, onClose }) {
  const { t, i18n } = useTranslation(), dialogRef = useRef(null), printRef = useRef(null);
  const [error, setError] = useState(false), [scope, setScope] = useState(work.quantity > 50 ? 'one' : 'all'), [piece, setPiece] = useState('1');
  const number = Number(piece), validPiece = piece.trim() !== '' && Number.isSafeInteger(number) && number > 0 && number <= work.quantity;
  const pieceNumbers = scope === 'all' ? Array.from({ length: work.quantity }, (_, index) => index + 1) : validPiece ? [number] : [];
  const print = useReactToPrint({ contentRef: printRef, documentTitle: work.shopBarcode, ignoreGlobalStyles: true, pageStyle: '@page { margin: 10mm; } body { margin: 0; } svg { display: block; max-width: 100%; height: auto; margin: 0 auto; } [data-shop-print-label] { display: block !important; } [data-shop-piece-label] { break-inside: avoid; break-after: page; border: 0 !important; } [data-shop-piece-label]:last-child { break-after: auto; }', onPrintError: () => setError(true) });
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  const materials = work.shopFlow?.materials || work.materials || [];
  return <dialog ref={dialogRef} dir={i18n.dir()} className="work-dialog shop-barcode-dialog" aria-labelledby="shop-barcode-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="work-dialog-header"><div><h2 id="shop-barcode-title">{t('workers.shopFlow.barcodeTitle')}</h2><p>{t('workers.shopFlow.barcodeHint')}</p></div><button className="work-close" type="button" onClick={onClose} aria-label={t('dialog.close')}><IoCloseOutline /></button></header>
    <div className="work-dialog-body">
      <div className="shop-label-controls">
        <div className="work-field"><label htmlFor="shop-label-scope">{t('workers.shopFlow.printSelection')}</label><select id="shop-label-scope" className="work-input" value={scope} onChange={event => { setScope(event.target.value); setError(false); }}><option value="all">{t('workers.shopFlow.allPieces', { count: work.quantity })}</option><option value="one">{t('workers.shopFlow.onePiece')}</option></select></div>
        {scope === 'one' && <div className="work-field"><label htmlFor="shop-label-piece">{t('workers.shopFlow.pieceNumber')}</label><input id="shop-label-piece" className="work-input" type="number" min="1" max={work.quantity} step="1" dir="ltr" value={piece} onChange={event => { setPiece(event.target.value); setError(false); }} aria-invalid={!validPiece} aria-describedby={!validPiece ? 'shop-label-piece-error' : undefined} />{!validPiece && <p id="shop-label-piece-error" role="alert" className="work-field-error">{t('workers.shopFlow.invalidPiece', { count: work.quantity })}</p>}</div>}
      </div>
      <div ref={printRef} data-shop-print-label dir={i18n.dir()} style={{ display: 'grid', gap: '16px' }}>
        {pieceNumbers.map(number => {
          const row = materials[number - 1], barcode = shopPieceBarcode(work, number);
          return <article key={number} data-shop-piece-label={number} style={{ width: '100%', padding: '4mm', maxWidth: '90mm', margin: '0 auto', boxSizing: 'border-box', border: '1px solid #ddd', background: '#fff', color: '#000', fontFamily: 'Tahoma, Arial, sans-serif', textAlign: 'center', overflowWrap: 'anywhere' }}>
            <h3 style={{ fontSize: '15px', margin: '0 0 8px' }}>{t('workers.work.types.shop')} · {t('fesla.garmentTypes.' + work.garmentType)}</h3>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '6px 0' }}>{t('workers.work.pieceCards.pieceNumber', { number })}</p>
            <p style={{ fontSize: '12px', margin: '4px 0' }} dir="auto">{worker.name} · {t('workers.categories.' + work.category)}</p>
            {row && <div style={{ borderTop: '1px dashed #888', marginTop: '8px', paddingTop: '6px', fontSize: '12px' }}><p dir="auto" style={{ margin: '4px 0' }}>{row.fabricType} · {row.fabricColor}</p>{row.size && <p style={{ margin: '4px 0' }}>{t('workers.work.pieceCards.size')}: <bdi dir="ltr">{row.size}</bdi></p>}</div>}
            <Barcode value={barcode} format="CODE128" width={1} height={48} displayValue={false} margin={6} /><p data-work-piece-barcode={barcode} dir="ltr" style={{ fontSize: '11px', fontFamily: 'monospace', margin: '4px 0' }}>{barcode}</p>
          </article>;
        })}
      </div>
      {error && <p role="alert" className="work-field-error">{t('fesla.errors.printFailed')}</p>}
    </div>
    <footer className="work-dialog-footer"><button className="work-button work-button-quiet" type="button" onClick={onClose}>{t('dialog.close')}</button><button className="work-button work-button-blue" type="button" data-print-shop-label disabled={!pieceNumbers.length} onClick={() => { setError(false); print(); }}><IoPrintOutline />{t(scope === 'all' ? 'workers.shopFlow.printBarcode' : 'workers.shopFlow.printOne')}</button></footer>
  </dialog>;
}
