import React, { useMemo } from "react";
import { Linkedin, Globe, Github } from "lucide-react";
import { useTranslation } from "react-i18next";

const Team = () => {
  const { t } = useTranslation();

  const members = useMemo(
    () => [
      {
        name: "Izghalene El-Mahdi",
        role: t("landingTeam.backendRole"),
        image: "img4.png",
      },
      {
        name: "BasKer Ayoub",
        role: t("landingTeam.frontendRole"),
        image: "/me-profile.png",
        Linkedin: "https://www.linkedin.com/in/baskerayoub/",
        WebSite: "https://baskeer.vercel.app/",
        Github: "https://github.com/baskerayoub",
      },
    ],
    [t]
  );

  return (
    <section id="team" className="py-24 bg-gray-100 dark:bg-[#1e293b] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-[#19b393] font-bold uppercase text-sm mb-4 text-center">
          {t("landingTeam.label")}
        </h2>
        <p className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-16 text-center">
          {t("landingTeam.title")}
        </p>

        <div className="flex flex-wrap justify-center gap-8">
          {members.map((member, index) => (
            <div
              key={index}
              className="group relative bg-white dark:bg-[#1a2230] p-3 rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 border border-transparent dark:border-gray-800 w-full max-w-67.5"
            >
              <div className="aspect-4/5 overflow-hidden rounded-2xl mb-6 relative bg-gray-200">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full grayscale-100 object-cover scale-125 transition-all duration-500 group-hover:grayscale group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-linear-to-t from-[#19b393]/80 via-[#19b393]/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out flex items-end justify-center pb-8">
                  <div className="flex gap-4">
                    <a href={member.Linkedin} target="_blank" rel="noreferrer">
                      <Linkedin className="text-white w-6 h-6 cursor-pointer hover:scale-110 transition-transform" />
                    </a>
                    <a href={member.WebSite} target="_blank" rel="noreferrer">
                      <Globe className="text-white w-6 h-6 cursor-pointer hover:scale-110 transition-transform" />
                    </a>
                    <a href={member.Github} target="_blank" rel="noreferrer">
                      <Github className="text-white w-6 h-6 cursor-pointer hover:scale-110 transition-transform" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="px-3 pb-4 text-center">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white transition-colors">
                  {member.name}
                </h4>
                <p className="text-gray-500 dark:text-gray-400 transition-colors">
                  {member.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Team;
