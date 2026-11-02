import React from "react";
import { Box, Twitter, Facebook, Linkedin, Instagram } from "lucide-react";
import { useTranslation } from "react-i18next";

const Footer = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="relative w-full overflow-hidden bg-linear-to-t from-[#c2ddf279] to-gray-100 dark:from-[#14283d] dark:to-[#1e293b] transition-colors duration-500 border-t border-gray-200 dark:border-none">
      <div className="max-w-7xl mx-auto px-4 py-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 items-start">
          <div className="lg:col-span-1">
            <div className="flex items-center space-x-2 mb-6 text-gray-900 dark:text-white font-bold text-2xl">
              <div className="bg-[#19b393] p-2 rounded-xl">
                <Box size={24} className="text-white" />
              </div>
              <span>
                Stock<span className="text-[#19b393]">Pro</span>
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm">
              {t("landingFooter.description")}
            </p>
          </div>

          <div className="md:pl-10 lg:border-l border-gray-200 dark:border-white/10">
            <h4 className="text-gray-900 dark:text-white font-bold mb-6 uppercase tracking-wider text-sm">
              {t("landingFooter.product")}
            </h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400">
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.features")}</li>
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.pricing")}</li>
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.apiDocs")}</li>
            </ul>
          </div>

          <div className="md:pl-10 lg:border-l border-gray-200 dark:border-white/10">
            <h4 className="text-gray-900 dark:text-white font-bold mb-6 uppercase tracking-wider text-sm">
              {t("landingFooter.company")}
            </h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400">
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.aboutUs")}</li>
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.careers")}</li>
              <li className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.privacyPolicy")}</li>
            </ul>
          </div>

          <div className="md:pl-10 lg:border-l border-gray-200 dark:border-white/10">
            <h4 className="text-gray-900 dark:text-white font-bold mb-6 uppercase tracking-wider text-sm">
              {t("landingFooter.followUs")}
            </h4>
            <div className="flex gap-3">
              {[Twitter, Facebook, Linkedin, Instagram].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="p-3 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-[#19b393] hover:text-white dark:hover:bg-[#19b393] text-gray-600 dark:text-gray-400 transition-all shadow-sm"
                >
                  <Icon size={20} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-20 relative h-px w-full bg-[#c2ddf2]/50 dark:bg-linear-to-r dark:from-transparent dark:via-[#19b393]/50 dark:to-transparent">
          <div className="hidden dark:block absolute inset-0 bg-[#19b393] animate-ping blur-[2px] opacity-40" />
        </div>

        <div className="mt-10 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 dark:text-gray-500 text-sm">
          <p>{t("landingFooter.rights", { year })}</p>
          <div className="flex gap-8">
            <span className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.terms")}</span>
            <span className="hover:text-[#19b393] cursor-pointer transition-colors">{t("landingFooter.cookies")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
