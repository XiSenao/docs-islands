import type { CompProps } from '../type';
import './css/multi-export.css';

function MultiExportCard({
  label,
  props,
}: {
  label: string;
  props: CompProps;
}) {
  return (
    <div className="multi-export-card">
      <strong>{label}</strong>
      <span>{props['component-name']}</span>
    </div>
  );
}

export function MultiExportAlpha(props: CompProps) {
  return <MultiExportCard label="MultiExportAlpha" props={props} />;
}

export function MultiExportBeta(props: CompProps) {
  return <MultiExportCard label="MultiExportBeta" props={props} />;
}
