import { useTranslation } from "react-i18next";
import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import { gsap } from "gsap";
import { Draggable } from "gsap/dist/Draggable";
import { IoTrashOutline, IoWarningOutline, IoPersonOutline } from "react-icons/io5";
import { EmployeeCard } from "./EmployeeCard";
import EmployeeSearch from "./EmployeeSearch";
import { useDispatch, useSelector } from "react-redux";
import { DeleteEmploye, GetAllEmploye } from "../../slices/sliceEmploye";

gsap.registerPlugin(Draggable);

export const EmployeeDashboard = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [refreshEmployees, setRefreshEmployees] = useState(false);

  const [view, setView] = useState("card"); // 'card' or 'list'
  const [searchTerm, setSearchTerm] = useState(""); // Added for Search logic
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const containerRef = useRef(null);
  const deleteZoneRef = useRef(null);

  const { Employe } = useSelector((state) => state.Employe);

  useEffect(() => {
    dispatch(GetAllEmploye());
  }, [dispatch , refreshEmployees]);

  // ================= SEARCH FILTER LOGIC =================
  const filteredEmployees = (Employe || []).filter((emp) => {
    const search = searchTerm.toLowerCase();
    return (
      emp.name?.toLowerCase().includes(search) ||
      emp.email?.toLowerCase().includes(search) ||
      emp.cin?.toLowerCase().includes(search)
    );
  });

  // ================= DELETE LOGIC =================
  const confirmDelete = () => {
    if (!pendingDelete) return;

    if (view === "card") {
      gsap.to(pendingDelete.target, {
        scale: 0,
        opacity: 0,
        duration: 0.25,
        onComplete: () => {
          dispatch(DeleteEmploye(pendingDelete.id));
          setPendingDelete(null);
          setConfirmOpen(false);
        },
      });
    } else {
      dispatch(DeleteEmploye(pendingDelete.id));
      setPendingDelete(null);
      setConfirmOpen(false);
    }
  };

  const cancelDelete = () => {
    if (view === "card" && pendingDelete?.target) {
      gsap.to(pendingDelete.target, {
        x: 0, y: 0, scale: 1, rotate: "0deg", opacity: 1,
        duration: 0.4, ease: "elastic.out(1, 0.75)",
      });
      pendingDelete.target.style.zIndex = 1;
    }
    setPendingDelete(null);
    setConfirmOpen(false);
  };

  // ================= GSAP DRAG INTERACTION =================
  useLayoutEffect(() => {
    if (view !== "card") return; 

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray(".card-wrapper");
      cards.forEach((card) => {
        Draggable.create(card, {
          type: "x,y",
          edgeResistance: 0.65,
          dragClickables: false,
          zIndexBoost: false,
          onDragStart() {
            gsap.to(deleteZoneRef.current, { scale: 1.1, opacity: 1, duration: 0.25 });
            this.target.style.zIndex = 50;
          },
          onDrag() {
            if (this.hitTest(deleteZoneRef.current, "50%")) {
              setDeleteOpen(true);
              gsap.to(this.target, { scale: 0.5, rotate: "15deg", opacity: 0.5, duration: 0.2 });
            } else {
              setDeleteOpen(false);
              gsap.to(this.target, { scale: 1, rotate: "0deg", opacity: 1, duration: 0.2 });
            }
          },
          onDragEnd() {
            gsap.to(deleteZoneRef.current, { scale: 1, opacity: 0.8, duration: 0.25 });
            if (this.hitTest(deleteZoneRef.current, "50%")) {
              setPendingDelete({ id: this.target.dataset.id, target: this.target });
              this.target.style.zIndex = 1;
              setConfirmOpen(true);
            } else {
              gsap.to(this.target, { x: 0, y: 0, duration: 0.5, ease: "power2.out" });
              this.target.style.zIndex = 1;
            }
          },
        });
      });
    }, containerRef);
    return () => ctx.revert();
  }, [filteredEmployees, view]); // Trigger update when filtered list changes

  return (
    <div className="min-h-screen transition-colors duration-300 pb-20 ">
      <div className="px-6 md:px-5 mb-8">
        <EmployeeSearch 
          view={view} 
          setView={setView} 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm} 
        />
      </div>

      {/* Conditional Rendering: Cards vs List */}
      <div className="max-w-7xl mx-auto px-6">
        {filteredEmployees.length > 0 ? (
          view === "card" ? (
            /* CARD GRID VIEW */
            <div ref={containerRef} className="flex flex-wrap gap-8 justify-center md:justify-start">
              {filteredEmployees.map((emp) => (
                <div key={emp._id} data-id={emp._id} className="card-wrapper cursor-grab active:cursor-grabbing z-0">
                  <EmployeeCard employee={emp}
                    onUpdated={() => setRefreshEmployees(prev => !prev)}

                  />
                </div>
              ))}
            </div>
          ) : (
            /* LIST TABLE VIEW */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("employees.employee")} </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("employees.cin")} </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("employees.email")} </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">{t("employees.actions")} </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600">
                            <IoPersonOutline size={16} />
                          </div>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{emp.cin || t("employees.unavailable")}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">{emp.email}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => { setPendingDelete({ id: emp._id }); setConfirmOpen(true); }}
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                        >
                          <IoTrashOutline size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="w-full py-20 text-center font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">{t("employees.empty")} </div>
        )}
      </div>

      {/* Trash Zone only visible in Card View */}
      {view === "card" && (
        <div
          ref={deleteZoneRef}
          className={`fixed bottom-10 right-10 w-24 h-24 flex flex-col items-center justify-center rounded-full shadow-2xl transition-all duration-300 z-100
            ${deleteOpen ? "bg-rose-600 scale-110 opacity-100 ring-4 ring-rose-500/20" : "bg-slate-800 dark:bg-rose-800 scale-90 opacity-40 hover:opacity-100"}
          `}
        >
          <IoTrashOutline className="text-white text-3xl mb-1" />
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 w-full max-w-sm border border-slate-100 dark:border-slate-800 text-center">
            <div className="mx-auto w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-2xl flex items-center justify-center text-rose-600 mb-6">
              <IoWarningOutline size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight mb-2">{t("employees.deleteTitle")} </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{t("employees.deleteConfirm")} </p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDelete} className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-[0.2em]">{t("employees.delete")} </button>
              <button onClick={cancelDelete} className="w-full py-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-[0.2em]">{t("common.cancel")} </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};