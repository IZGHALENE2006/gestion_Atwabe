import { forwardRef } from "react";
import { productBatches } from "../../../shared/productBatches.js";
import ProductBarcode from "./ProductBarcode.jsx";

const ProductBatchLabels = forwardRef(function ProductBatchLabels({ product, batchId }, ref) {
  if (!product) return null;
  const batches = productBatches(product).filter(batch => batchId === undefined || batch.batchId === batchId);
  const labels = batches.flatMap(batch => Array.from({ length: batch.quantite || 0 }, () => batch));
  return <div ref={ref} style={{ padding: "10px", display: "flex", flexWrap: "wrap", gap: "15px" }}>
    {labels.map((batch, index) => <div key={index} data-product-print-batch={batch.batchId} style={{ border: "1px solid #eee", padding: "10px", textAlign: "center", width: "330px", background: "#fff", color: "#000", breakInside: "avoid" }}>
      <p style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "5px" }}>{product.name}</p>
      <ProductBarcode value={batch.barcode} />
      <p style={{ fontSize: "12px", marginTop: "5px", fontWeight: "900" }}>#{batch.number}</p>
    </div>)}
  </div>;
});
export default ProductBatchLabels;
