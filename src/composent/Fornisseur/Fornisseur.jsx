import useSearchTarget from "../../hooks/useSearchTarget.js";
import React, { useEffect, useRef, useState } from 'react';
import { 
  IoSearchOutline, IoAddOutline, IoPeopleOutline, 
  IoLocationOutline, 
  IoGridOutline, IoListOutline ,
  IoMailOutline,  
  IoCallOutline
} from "react-icons/io5";
import FrnCard from './FrnCard';
import AjouterFrn from './AjouterFrn.jsx';
import Dialog from '../Dialog/Dialog';
import { GetAllFournisseur,DeleteFournisseur, UpdateFournisseur } from "../../slices/SliceFournisseur.jsx";
import { useDispatch, useSelector } from 'react-redux';
import {  IoWarningOutline } from "react-icons/io5";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import cities from "./cities.json"
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
const Fornisseur = () => {
  const { t } = useTranslation();
  const matchesSearchTarget = useSearchTarget();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewType, setViewType] = useState("grid"); // 'grid' or 'list'
const VILLES_DATA = cities.cities.data.map(c => c.names.fr)
    const dropdownRef = useRef(null);
  const { token } = useSelector((state) => state.LoginAdmin);
  
  const { Fournisseur, loading, listLoading, listError } = useSelector((state) => state.Fournisseur);
  const Dispatch = useDispatch();
const navigate = useNavigate()
  useEffect(() => {
    Dispatch(GetAllFournisseur());
  }, [Dispatch]);

  const filteredSuppliers = Fournisseur.filter(matchesSearchTarget).filter(s => 
   s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
const [confirmOpen,setconfirmOpen] = useState(false)
const [idDelete,setIdDelete] = useState("")
  function HandleopenDelete(id){
   setIdDelete(id)
   setconfirmOpen(true)
  }
  
//Confireme delete 
function confirmDelete() {
  Dispatch(DeleteFournisseur(idDelete))
    .unwrap()
    .then(() => {
  toast.success(t("supplier.deleted"),{
    position:"top-right",
    duration:1000
  })
   setconfirmOpen(false);
    })
    .catch((error) => {
      toast.error(error === "supplierHasInvoices" ? t("supplierInvoices.errors.supplierHasInvoices") : t("supplier.deleteFailed"));
    });
}
//ClosseDelete 
function cancelDelete(){
setconfirmOpen(false)
}
//Logic Edite 
//Get curent Value
const [selectedSupplier,setselectedSupplier] = useState({
     name: " ",
    email: "",
    phone: "",
    Ville: ""
})

  const [showDatalist, setShowDatalist] = useState(false);
    // Filter logic: find cities that include the typed text
      // Close dropdown when clicking outside
      useEffect(() => {
        const handleClickOutside = (event) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setShowDatalist(false);
          }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }, []);
  const filteredVilles = VILLES_DATA.filter(ville => 
    ville.toLowerCase().includes((selectedSupplier.Ville||"").toLowerCase())
  );
const [editOpen,setEditOpen] = useState(false)
const [IdUpdate,setIdUpdate] = useState("")
function HandleopenUpdate(id){
  const supplier = Fournisseur.find((entry) => entry._id === id);
  setselectedSupplier({ name: supplier.name || "", email: supplier.email || "", phone: supplier.phone || "", Ville: supplier.Ville || "" });
  setIdUpdate(id)
  setEditOpen(true)
}
function  HandleUpdateFornisseur(){
  Dispatch(UpdateFournisseur({selectedSupplier,IdUpdate}))
  setEditOpen(false)
  
}
useEffect(() => {
  if (!token) {
    navigate("/LoginChoise");
  }
}, [token, navigate]);
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#1e293b] p-6 lg:p-10 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col lg:flex-row gap-6 mb-10">
          
          {/* Stats Card */}
          <div className="flex flex-1 items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="p-4 rounded-[1.8rem] bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-500">
              <IoPeopleOutline size={32} />
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t("supplier.total")} </p>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">
                {Fournisseur.length}
              </h1>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex flex-2 flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="relative flex-1 w-full group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                <IoSearchOutline size={20} />
              </span>
              <input
                type="text"
                placeholder={t("supplier.search")}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-200 font-bold text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              {/* TOGGLE VIEW SWITCH */}
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                <button 
                  onClick={() => setViewType('grid')}
                  aria-label={t("supplier.cards")}
                  aria-pressed={viewType === "grid"}
                  className={`p-2.5 rounded-xl transition-all ${viewType === 'grid' ? 'bg-white dark:bg-slate-700 shadow-md text-primary-600 dark:text-primary-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  <IoGridOutline size={20} />
                </button>
                <button 
                  onClick={() => setViewType('list')}
                  aria-label={t("supplier.list")}
                  aria-pressed={viewType === "list"}
                  className={`p-2.5 rounded-xl transition-all ${viewType === 'list' ? 'bg-white dark:bg-slate-700 shadow-md text-primary-600 dark:text-primary-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  <IoListOutline size={20} />
                </button>
              </div>

              {/* Add Button */}
              <button
                onClick={() => setOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary-600/20 active:scale-95"
              >
                <IoAddOutline size={20} />{t("supplier.add")} </button>
            </div>
          </div>
        </div>

        {/* CONTENT SECTION */}
        {listLoading && <p role="status" className="mb-4 text-sm text-slate-500">{t("common.loading")}</p>}
        {listError && <div role="alert" className="mb-4 rounded-xl border border-rose-200 p-4 text-sm text-rose-600"><p>{t("supplier.loadFailed")}</p><button onClick={() => Dispatch(GetAllFournisseur())} className="mt-2 font-bold underline">{t("supplierInvoices.retry")}</button></div>}
        <div className={viewType === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" 
          : "flex flex-col gap-4"}
        >
          {filteredSuppliers.map(f => (
            <FrnCard 
              key={f._id}
              supplier={f} 
              viewType={viewType}
              onEdit={() => HandleopenUpdate(f._id)} 
              onDelete={() => HandleopenDelete(f._id)} 
              onOpen={() => navigate(`/Home/Fornisseur/${f._id}/invoices`)}
            />
          ))}
        </div>

        {/* Empty State */}
        {!listLoading && !listError && filteredSuppliers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-full">
                <IoSearchOutline size={40} className="text-slate-300 dark:text-slate-700" />
              </div>
              <p className="text-slate-400 dark:text-slate-600 font-black uppercase text-[10px] tracking-[0.3em]">{t("supplier.empty")} </p>
          </div>
        )}
      </div>

      {/* Dialog for adding Supplier */}
      <Dialog 
        bgcolor={document.documentElement.classList.contains('dark') ? "#0f172a" : "#ffffff"}
        width="600px" 
        isOpen={open} 
        onClose={() => setOpen(false)} 
        title={t("supplier.add")}
      >
        <div className="animate-in zoom-in-95 duration-300">
          <AjouterFrn close={() => setOpen(false)} />
        </div>
      </Dialog>
            {confirmOpen && (
              <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-sm border border-slate-100 dark:border-slate-800 text-center transform animate-in zoom-in-95 duration-200">
                  <div className="mx-auto w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-2xl flex items-center justify-center text-rose-600 mb-6">
                    <IoWarningOutline size={32} />
                  </div>
                  
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight mb-2">{t("supplier.deleteTitle")} </h2>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{t("supplier.deleteConfirm")} </p>
      
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={confirmDelete}
                      className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-rose-600/20 transition-all active:scale-95"
                    >{t("supplier.confirm")} </button>
                    <button
                      onClick={cancelDelete}
                      className="w-full py-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >{t("common.cancel")} </button>
                  </div>
                </div>
              </div>
            )}
            <ToastContainer/>
            {/* Dialog for Editing Supplier */}
<Dialog 
  bgcolor={document.documentElement.classList.contains('dark') ? "#0f172a" : "#ffffff"}
  width="600px" 
  isOpen={editOpen} 
  onClose={() => setEditOpen(false)} 
  title={t("supplier.edit")}
>
  <div className="animate-in fade-in zoom-in-95 duration-300 p-1">
    <div className="space-y-6">
      
      {/* SECTION: Basic Info */}
      <div className="relative group">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2 block ml-1">{t("supplier.name")} </label>
        <div className="relative">
          <input 
            type="text" 
            value={selectedSupplier?.name}
            onChange={(e) => setselectedSupplier({...selectedSupplier, name: e.target.value})}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 px-5 outline-none text-slate-700 dark:text-slate-100 font-semibold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all duration-300 shadow-sm"
            placeholder={t("supplier.namePlaceholder")}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity">
            <IoPeopleOutline className="text-primary-500" size={20} />
          </div>
        </div>
      </div>

      {/* SECTION: Location & Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ville with Modern Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block ml-1">{t("supplier.city")} </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600">
              <IoLocationOutline size={18} />
            </span>
            <input
              value={selectedSupplier.Ville}
              onFocus={() => setShowDatalist(true)}
              onChange={(e) => {
                setselectedSupplier({ ...selectedSupplier, Ville: e.target.value });
                setShowDatalist(true);
              }}
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-100 font-semibold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all duration-300"
              placeholder={t("supplier.searchCity")}
            />
          </div>
          
          {/* Enhanced Dropdown List */}
          {showDatalist && filteredVilles.length > 0 && (
            <div className="absolute z-[60] w-full mt-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl max-h-56 overflow-y-auto shadow-2xl shadow-primary-900/10 animate-in slide-in-from-top-2 duration-200">
              {filteredVilles.map((ville, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setselectedSupplier({ ...selectedSupplier, Ville: ville });
                    setShowDatalist(false);
                  }}
                  className="px-5 py-3.5 hover:bg-primary-50 dark:hover:bg-primary-500/10 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-none"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-400"></div>
                  {ville}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Téléphone */}
        <div className="relative">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block ml-1">{t("supplier.phone")} </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600">
              <IoCallOutline size={18} />
            </span>
            <input 
              type="tel" 
              value={selectedSupplier.phone}
              onChange={(e) => setselectedSupplier({...selectedSupplier, phone: e.target.value})}
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-100 font-semibold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all duration-300"
              placeholder="06 -- -- -- --"
            />
          </div>
        </div>
      </div>

      {/* Email */}
      <div className="relative">
        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block ml-1">{t("supplier.email")} </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600">
            <IoMailOutline size={18} />
          </span>
          <input 
            type="email" 
            value={selectedSupplier?.email}
            onChange={(e) => setselectedSupplier({...selectedSupplier, email: e.target.value})}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-100 font-semibold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all duration-300"
            placeholder="contact@entreprise.com"
          />
        </div>
      </div>

      {/* ACTION BUTTONS: The Signature */}
      <div className="flex items-center gap-4 pt-6">
        <button
          onClick={() => setEditOpen(false)}
          className="flex-1 py-4 px-6 rounded-2xl text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 bg-red-50"
        >{t("common.cancel")} </button>
        <button
          className="flex-[2] py-4 px-6 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-primary-500/20 hover:shadow-primary-500/40 transition-all active:scale-95 flex items-center justify-center gap-2"
          onClick={HandleUpdateFornisseur}
        >
          {loading ?'.....' :t("supplier.update")}
        </button>
      </div>
    </div>
  </div>
</Dialog>
    </div>
  );
};

export default Fornisseur;
