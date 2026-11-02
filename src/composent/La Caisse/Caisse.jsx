import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import gsap from "gsap";
import CaisseSection from "./Section";
import RightSidebar from "./RightSidebar";
import "./Caisse.css";
import { useNavigate } from "react-router";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { addCashierBatch, cashierCartRows, cashierBatchChoices, cashierRowKey, setCashierRowQuantity } from '../../../shared/cashierBatches.js';
import { apiErrorMessage } from '../../i18n/apiErrors.js';


function LaCaisse() {
  const { t } = useTranslation();
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState({ type: "percent", value: "" });
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { Produts = [] } = useSelector(state => state.Product);
  const { token } = useSelector((state) => state.LoginAdmin);

  const groups = cashierCartRows(cart, Produts);
  const applyChoice = (product, choice, quantity = 1, replacingKey) => setCart(current => {
    try { return addCashierBatch(current, product, choice, quantity, replacingKey); }
    catch (error) { toast.error(apiErrorMessage(error, t)); return current; }
  });
  const handleAddToCart = (product, choice) => applyChoice(product, choice || cashierBatchChoices(product)[0]);
  const handlePriceTypeChange = (key, priceType) => {
    const group = groups.find(entry => entry.key === key), product = Produts.find(entry => entry._id === group?.id);
    if (!group || !product || group.priceType === priceType) return;
    const choice = cashierBatchChoices(product, priceType).find(entry => entry.batchId === group.batchId);
    if (choice) applyChoice(product, choice, group.qty, key);
  };
  const handleUpdateQty = (key, quantity) => setCart(current => {
    const group = cashierCartRows(current).find(entry => entry.key === key), product = Produts.find(entry => entry._id === group?.id);
    if (!product) return current;
    try { return setCashierRowQuantity(current, product, key, quantity); }
    catch (error) { toast.error(apiErrorMessage(error, t)); return current; }
  });
  const handleRemoveItem = key => {
    setCart(current => current.filter(item => cashierRowKey(item) !== key));
    if (groups.length === 1) setDiscount({ type: 'percent', value: '' });
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".ticket-section", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "expo.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const clearCart = () => {
    setCart([]);
    setDiscount({ type: "percent", value: "" });
  };

  useEffect(() => {
    if (!token) {
      navigate("/LoginChoise");
    }
  }, [token, navigate]);

  return (
    <div
      ref={containerRef}
      className="p-6 bg-gray-100 dark:bg-[#1e293b] min-h-screen text-[#1e293b] dark:text-white flex flex-col gap-6 font-sans"
    >
      <Toaster position="top-center" />
      <div className="flex flex-col lg:flex-row gap-6 flex-1 h-full">
        <CaisseSection
          cart={cart}
          onAddToCart={handleAddToCart}
          onClearCart={clearCart}
          discount={discount}
          onDiscountChange={setDiscount}
        />
        <RightSidebar
          panierItems={groups}
          onUpdateQty={handleUpdateQty}
          onRemoveItem={handleRemoveItem}
          onPriceTypeChange={handlePriceTypeChange}
        />
      </div>
    </div>
  );
}

export default LaCaisse;
