import React from "react";
import { Mail, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

const Contact = () => {
  const { t } = useTranslation();
  return (
    <section id="contact" className="py-24 bg-white dark:bg-gray-900 relative transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          <div className="flex flex-col justify-center">
            <h2 className="text-[#19b393] font-bold uppercase text-sm mb-4">
              {t("landingContact.label")}
            </h2>
            <p className="text-4xl font-extrabold text-gray-900 dark:text-white mb-8 transition-colors">
              {t("landingContact.title")}
            </p>

            <div className="space-y-8">
              <div className="flex items-center gap-6 group">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 text-[#19b393] rounded-2xl transition-colors">
                  <Mail />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white transition-colors">
                    {t("landingContact.emailUs")}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">StockPro@Gmail.com</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-[2.5rem] transition-colors border border-transparent dark:border-gray-700">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <input
                type="text"
                placeholder={t("landingContact.namePlaceholder")}
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#19b393] focus:border-transparent outline-none transition-all"
              />
              <input
                type="email"
                placeholder={t("landingContact.emailPlaceholder")}
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#19b393] focus:border-transparent outline-none transition-all"
              />
              <textarea
                placeholder={t("landingContact.messagePlaceholder")}
                rows="4"
                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#19b393] focus:border-transparent outline-none transition-all"
              />
              <button className="w-full py-5 bg-[#19b393] hover:bg-[#12846e] text-white rounded-2xl font-bold flex justify-center items-center gap-2 shadow-lg shadow-[#19b393]/20 transition-all">
                {t("landingContact.sendMessage")} <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
