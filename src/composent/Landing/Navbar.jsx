import React, { useState, useEffect, useMemo } from "react";
import { Box, Menu, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

const Navbar = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = useMemo(
    () => [
      { name: t("landingNav.home"), href: "#home" },
      { name: t("landingNav.about"), href: "#about" },
      { name: t("landingNav.team"), href: "#team" },
      { name: t("landingNav.contact"), href: "#contact" },
    ],
    [t]
  );

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/80 dark:bg-slate-800/90 backdrop-blur-lg py-4 shadow-sm"
          : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="bg-[#19b393] p-1.5 rounded-lg">
              <Box className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Stock<span className="text-[#19b393]"> Pro</span>
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#19b393] dark:hover:text-[#19b393] transition-colors"
              >
                {link.name}
              </a>
            ))}
            <NavLink to="/LoginChoise">
              <button className="bg-[#19b393] text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#12846e] transition-all shadow-md">
                {t("landingNav.getStarted")}
              </button>
            </NavLink>
          </div>

          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-600 dark:text-gray-300"
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div
          className={`md:hidden absolute top-full left-0 w-full bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-xl p-4 ${
            isArabic ? "text-right" : ""
          }`}
        >
          <div className="flex flex-col space-y-4">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-gray-600 dark:text-gray-300 hover:text-[#19b393] dark:hover:text-[#19b393]"
              >
                {link.name}
              </a>
            ))}
            <NavLink
              to="/LoginChoise"
              className="bg-[#19b393] text-white w-full py-3 rounded-xl font-bold text-center"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {t("landingNav.getStarted")}
            </NavLink>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
