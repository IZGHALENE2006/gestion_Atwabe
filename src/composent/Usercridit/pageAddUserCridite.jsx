import { apiErrorMessage } from "../../i18n/apiErrors.js";
import React, { useState } from 'react';
import { 
  IoPersonOutline, 
  IoCardOutline, 
  IoMailOutline, 
  IoCallOutline, 
  IoCheckmarkCircleOutline,
  IoArrowBackOutline,
  IoWalletOutline,
  IoShieldCheckmarkOutline
} from "react-icons/io5";
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { addUserCiridite } from '../../slices/SliceCridite';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from "react-i18next";

const AddUserCredit = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const navigate = useNavigate();
  const [infousercridit,setInfoUserCridit] = useState({name:"",cin:"",phone:"",email:""})
  const disaptch = useDispatch()
  const { actionLoading } = useSelector((state) => state.userCridite);
async function HandeleAddUser(e) {
  e.preventDefault();

  try {
    await disaptch(addUserCiridite(infousercridit)).unwrap();

    toast.success(t("creditAddClient.userAddedSuccessfully"));

    setTimeout(() => {
      navigate("/Home/cridit/UserCridit");
    }, 1500);

  } catch (error) {
    toast.error(apiErrorMessage(error, t, "creditAddClient.somethingWentWrong"));
  }
}
  return (
    <div className="min-h-screen  dark:bg-[#0f172a] p-6 lg:p-10 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        
        {/* TOP NAVIGATION / BREADCRUMBS */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-primary-500 transition-colors mb-6 group"
        >
          <IoArrowBackOutline className={`transition-transform ${isArabic ? "rotate-180 group-hover:translate-x-1" : "group-hover:-translate-x-1"}`} size={20} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t("creditAddClient.backToCreditList")}</span>
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            
            {/* LEFT SIDE: INFO PANEL */}
      

            {/* RIGHT SIDE: FORM */}
            <div className="lg:w-3/3 p-8 lg:p-12">
              <form className="space-y-8" onSubmit={HandeleAddUser}>
                
                {/* Section 1: Identity */}
                <div className="space-y-6">
                  <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] border-b border-slate-100 dark:border-slate-800 pb-2">
                    {t("creditAddClient.clientIdentity")}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 group-focus-within:text-primary-500 transition-colors">
                        <IoPersonOutline size={14} /> {t("creditAddClient.fullName")}
                      </label>
                      <input 
                        type="text" 
                        placeholder={t("employees.namePlaceholder")}
                        className="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                      onChange={(e)=>setInfoUserCridit({...infousercridit,name:e.target.value})}
                   />
                    </div>

                    <div className="group space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 group-focus-within:text-primary-500 transition-colors">
                        <IoCardOutline size={14} /> {t("creditAddClient.idNumberCin")}
                      </label>
                      <input 
                        type="text" 
                        placeholder="BK123456"
                        className="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                      onChange={(e)=>setInfoUserCridit({...infousercridit,cin:e.target.value})}
                    
                   />
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact Details */}
                <div className="space-y-6">
                  <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] border-b border-slate-100 dark:border-slate-800 pb-2">
                    {t("creditAddClient.contactDetails")}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 group-focus-within:text-primary-500 transition-colors">
                        <IoMailOutline size={14} /> {t("creditAddClient.emailAddress")}
                     
                      </label>
                      <input 
                        type="email" 
                        placeholder="client@entreprise.com"
                        className="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                      onChange={(e)=>setInfoUserCridit({...infousercridit,email:e.target.value})}
                    
                    />
                    </div>

                    <div className="group space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 group-focus-within:text-primary-500 transition-colors">
                        <IoCallOutline size={14} /> {t("creditAddClient.phoneNumber")}
                      </label>
                      <input 
                        type="tel" 
                        placeholder="+212 600-000000"
                        className="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 px-5 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                      onChange={(e)=>setInfoUserCridit({...infousercridit,phone:e.target.value})}
                     
                   />
                    </div>
                  </div>
                </div>

                {/* FORM ACTIONS */}
                <div className="pt-8 flex items-center gap-4">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-3 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary-600/20 active:scale-95"
                  >
                    <IoCheckmarkCircleOutline size={20} /> {actionLoading ? t("creditAddClient.saving") : t("creditAddClient.registerClientAccount")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
};

export default AddUserCredit;
