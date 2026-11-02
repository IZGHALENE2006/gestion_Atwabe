import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function LiveClock() {
  const { i18n } = useTranslation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (

        time.toLocaleTimeString(i18n.language === "ar" ? "ar-MA" : "fr-MA")
  );
}
