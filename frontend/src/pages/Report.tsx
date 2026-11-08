import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ReportView } from "../components/ReportView";
import { ErrorBox, PageHeader, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAsync } from "../lib/useAsync";
import { useFeedback } from "../components/Feedback";

export default function ReportPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const { confirm, toast } = useFeedback();
  const { data, error, loading, reload } = useAsync(() => api.scan(id), [id]);

  const [deleteError, setDeleteError] = useState<unknown>(null);
  const remove = async () => {
    if (!data?.id || !(await confirm({ title: t.ui.deleteTitle, body: t.ui.deleteBody, danger: true }))) return;
    try {
      await api.deleteScan(data.id);
      toast(t.ui.deleted);
      nav("/history");
    } catch (e) {
      setDeleteError(e);
    }
  };

  return (
    <>
      <PageHeader title={`${t.report.title}${data?.id ? ` #${data.id}` : ""}`}
        actions={<>
          <Link to="/history" className="btn-ghost"><ArrowLeft size={15} />{t.common.back}</Link>
          {data && <button className="btn-danger" onClick={remove}><Trash2 size={15} />{t.common.delete}</button>}
        </>} />
      {(error || deleteError) ? <div className="mb-4"><ErrorBox error={error ?? deleteError} onRetry={() => { setDeleteError(null); reload(); }} /></div> : null}
      {loading && <Skeleton className="h-72" />}
      {data && <ReportView r={data} />}
    </>
  );
}
