import React, { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Layers, Users, BarChart3, Truck } from "lucide-react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";

gsap.registerPlugin(ScrollTrigger);

const About = () => {
  const { t } = useTranslation();
  const sectionRef = useRef(null);

  const features = useMemo(
    () => [
      {
        icon: Layers,
        title: t("landingAbout.productManagementTitle"),
        description: t("landingAbout.productManagementDesc"),
        color: "bg-primary-500",
      },
      {
        icon: BarChart3,
        title: t("landingAbout.realtimeTrackingTitle"),
        description: t("landingAbout.realtimeTrackingDesc"),
        color: "bg-[#19b393]",
      },
      {
        icon: Truck,
        title: t("landingAbout.supplierPortalTitle"),
        description: t("landingAbout.supplierPortalDesc"),
        color: "bg-orange-500",
      },
      {
        icon: Users,
        title: t("landingAbout.teamAccessTitle"),
        description: t("landingAbout.teamAccessDesc"),
        color: "bg-purple-500",
      },
    ],
    [t]
  );

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".feature-card").forEach((card) => {
        gsap.from(card, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
            end: "top 100%",
            toggleActions: "play none none none",
            scrub: 1,
          },
        });
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="py-24 bg-white dark:bg-gray-900 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-[#19b393] font-bold uppercase text-sm mb-4">
            {t("landingAbout.features")}
          </h2>
          <p className="text-4xl font-extrabold text-gray-900 dark:text-white mb-6 transition-colors">
            {t("landingAbout.title")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="feature-card p-8 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:border-[#19b393]/30 dark:hover:border-[#19b393]/50 transition-all group"
            >
              <div
                className={`w-14 h-14 rounded-xl ${feature.color} flex items-center justify-center mb-6 shadow-lg shadow-black/5`}
              >
                <feature.icon className="text-white w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 transition-colors leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-24 p-8 md:p-12 rounded-[2.5rem] bg-linear-to-tl from-[#0ca788] to-[#79dac6] dark:from-[#0ca788] dark:to-[#0ca788] relative overflow-hidden text-white flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="relative z-10 max-w-2xl">
            <h3 className="text-3xl font-bold mb-4">{t("landingAbout.ctaTitle")}</h3>
            <p className="text-white/80 text-lg">{t("landingAbout.ctaDesc")}</p>
          </div>
          <NavLink to="/LoginAdmin">
            <button className="relative z-10 px-8 py-4 bg-white text-[#19b393] rounded-2xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all">
              {t("landingAbout.ctaButton")}
            </button>
          </NavLink>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>
      </div>
    </section>
  );
};

export default About;
