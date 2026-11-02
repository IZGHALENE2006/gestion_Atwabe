import { Outlet } from "react-router-dom";
import NavRow from "./NavEmploye";
import { useTranslation } from "react-i18next";

export default function EmployeesPage() {
  const { i18n } = useTranslation();
  return (
    <div dir={i18n.dir()} className="flex flex-col gap-4 p-2 bg-gray-100 dark:bg-[#1e293b]">
      <NavRow />
      <div>
        {/* هاد المكان غادي يبدل على حسب الروت اللي مختار */}
        <Outlet />
      </div>
    </div>
  );
}
