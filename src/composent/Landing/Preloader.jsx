import { useTranslation } from "react-i18next";
import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Box } from 'lucide-react';

const Preloader = ({ onComplete }) => {
  const { t } = useTranslation();
  const containerRef = useRef();
  const lineRef = useRef();

  useGSAP(() => {
    const tl = gsap.timeline({
      onComplete: () => onComplete && onComplete(),
    });

    // 1. Reveal logo from bottom
    tl.fromTo(".logo-square", 
      { y: 50, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 1, ease: "power4.out" }
    )
    // 2. Expand the architectural hair-line
    .fromTo(lineRef.current, 
      { width: "0%" }, 
      { width: "100%", duration: 1.5, ease: "expo.inOut" }, "-=0.5"
    )
    // 3. Stagger text appearance
    .from(".reveal-text", {
      opacity: 0,
      y: 10,
      stagger: 0.1,
      duration: 0.8,
      ease: "power3.out"
    }, "-=1")
    // 4. Clean curtain exit
    .to(containerRef.current, {
      yPercent: -100,
      duration: 1.2,
      ease: "expo.inOut",
      delay: 0.3
    });

  }, { scope: containerRef });

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-gray-900/90 dark:bg-gray-200/70 backdrop-blur-3xl transition-colors duration-500 overflow-hidden"
    >
      <div className="flex flex-col items-center w-full max-w-70">
        
        {/* Flat Logo - No Shadow */}
        <div className="logo-square w-16 h-16 bg-[#19b393] rounded-xl flex items-center justify-center text-white mb-10">
          <Box size={36} />
        </div>

        {/* Brand Name */}
        <div className="text-center w-full">
          <h2 className="reveal-text text-white dark:text-gray-900 text-xl font-bold tracking-[0.4em] uppercase transition-colors">
            Stock Pro
          </h2>
          
          {/* Hairline Progress - Center Expanding */}
          <div className="relative h-px w-full bg-white/10 dark:bg-gray-200 my-6 overflow-hidden">
            <div 
              ref={lineRef} 
              className="absolute left-1/2 -translate-x-1/2 top-0 h-full bg-[#19b393]" 
            />
          </div>

          <p className="reveal-text text-[#19b393] text-[9px] font-black tracking-[0.6em] uppercase transition-colors">{t("common.loading")} </p>
        </div>

        {/* Footer info within preloader */}
        <div className="reveal-text mt-12 flex justify-between w-full border-t border-white/5 dark:border-gray-200 pt-4">
          <span className="text-[8px] text-gray-500 uppercase tracking-widest font-medium">{t("landingHero.betaVersion")} </span>
          <span className="text-[8px] text-gray-500 uppercase tracking-widest font-medium">{t("common.loading")} </span>
        </div>
      </div>
    </div>
  );
};

export default Preloader;