import { useTranslation } from "react-i18next";
import { WORK_TRACKING_CATEGORIES } from "../../../shared/workerWork.js";

export default function WorkerBlockingNotice({ blockers = [] }) {
  const { t } = useTranslation();
  return <span className="worker-blocking-notice" role="note">{blockers.filter(blocker => WORK_TRACKING_CATEGORIES.includes(blocker.category)).map((blocker, index) => <span key={`${blocker.category}:${index}`}>{t(blocker.workerName ? "workers.work.blockedBySectionNamed" : "workers.work.blockedBySection", { section: t(`workers.categories.${blocker.category}`), name: blocker.workerName || "" })}</span>)}</span>;
}
