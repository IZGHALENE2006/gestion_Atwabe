import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FaArrowRight, FaArrowTrendUp } from "react-icons/fa6";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";

const IMAGES = [
  "mck1.png",
  "mck2.png",
  "mck3.png",
  "mck4.png",
  "mck5.png",
  "mck6.png",
  "mck7.png",
  "mck8.png",
];

const Hero = () => {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const progressRef = useRef(null);
  const comparisonContainerRef = useRef(null);
  const timelineRef = useRef(null);

  const [index, setIndex] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".hero-word", {
        y: 60,
        opacity: 0,
        duration: 1,
        stagger: 0.1,
        ease: "expo.out",
      });
      gsap.from(buttonRef.current, { opacity: 0, y: 20, duration: 0.8, delay: 0.8 });

      timelineRef.current = gsap.timeline({
        repeat: -1,
        onRepeat: () => {
          gsap.set(progressRef.current, { scaleX: 0 });
        },
      });

      timelineRef.current
        .to(progressRef.current, {
          scaleX: 1,
          duration: 6,
          ease: "none",
          transformOrigin: "left center",
        })
        .call(() => {
          setIndex((prev) => (prev + 2) % IMAGES.length);
          gsap.to(
            { val: sliderPos },
            {
              val: 50,
              duration: 0.5,
              onUpdate: function () {
                setSliderPos(this.targets()[0].val);
              },
            }
          );
        });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleMove = (e) => {
    if (!isDragging || !comparisonContainerRef.current) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = comparisonContainerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.min(Math.max(x, 0), 100));
  };

  const nextPairIndex = (index + 1) % IMAGES.length;

  return (
    <section
      id="home"
      ref={containerRef}
      className="pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-gray-100 dark:bg-[#1e293b] transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left">
            <div className="animate-pulse inline-flex items-center space-x-2 px-3 py-1 bg-[#19b393]/10 border border-[#19b393]/20 rounded-full text-[#19b393] text-sm font-semibold mb-6">
              <FaArrowTrendUp />
              <span>{t("landingHero.badge")}</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white leading-[1.1] mb-8 transition-colors">
              <span className="block hero-word">{t("landingHero.title1")}</span>
              <span className="block hero-word text-[#19b393]">{t("landingHero.title2")}</span>
            </h1>
            <p className="hero-word text-lg md:text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-xl mx-auto lg:mx-0 transition-colors">
              {t("landingHero.description")}
            </p>
            <div ref={buttonRef}>
              <NavLink to="/LoginChoise">
                <button className="px-8 py-4 bg-[#19b393] text-white rounded-2xl font-bold text-lg hover:shadow-2xl shadow-[#19b393]/30 transition-all flex items-center gap-2 group mx-auto lg:mx-0">
                  {t("landingHero.startNow")}
                  <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
                </button>
              </NavLink>
            </div>
          </div>

          <div className="flex-1 relative w-full select-none">
            <div className="text-[12px] flex justify-between px-12 text-gray-500 dark:text-gray-100/50">
              <p>{t("landingHero.darkMode")}</p>
              <p>{t("landingHero.lightMode")}</p>
            </div>
            <div
              ref={comparisonContainerRef}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => {
                setIsDragging(false);
                timelineRef.current?.play();
              }}
              onMouseMove={handleMove}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={() => setIsDragging(false)}
              onTouchMove={handleMove}
              onMouseEnter={() => timelineRef.current?.pause()}
              className="relative z-10 rounded-[2.5rem] overflow-hidden shadow-2xl border-[6px] border-white dark:border-gray-700 bg-white dark:bg-gray-800 aspect-video cursor-ew-resize transition-colors"
            >
              <div className="absolute inset-0 scale-105">
                <img
                  key={`back-${nextPairIndex}`}
                  src={IMAGES[nextPairIndex]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>

              <div
                className="absolute inset-0 z-10 scale-105"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                <img
                  key={`front-${index}`}
                  src={IMAGES[index]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="absolute top-0 bottom-0 z-20 w-1 bg-[#19b393]" style={{ left: `${sliderPos}%` }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-gray-100 dark:bg-gray-700 rounded-full shadow-xl flex items-center justify-center text-white border-4 border-[#19b393]">
                  <div className="flex gap-0.5" />
                </div>
              </div>

              <div className="absolute bottom-0 left-0 w-full h-2 bg-black/5 dark:bg-white/10 z-30">
                <div
                  ref={progressRef}
                  className="h-full bg-[#19b393] rounded-r-full scale-x-0 origin-left shadow-[0_0_15px_rgba(51, 116, 173,0.8)]"
                />
              </div>
            </div>
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-[#19b393]/15 dark:bg-[#19b393]/10 rounded-full blur-3xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
