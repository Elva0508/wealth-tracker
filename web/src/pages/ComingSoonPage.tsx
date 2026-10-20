export function ComingSoonPage({ title, stage, description }: { title: string; stage: string; description: string }) {
  return (
    <div className="coming-soon">
      <h1>{title}</h1>
      <div className="card">
        <span className="chip">{stage} 即將推出</span>
        <p>{description}</p>
        <p className="muted small">在那之前，請先在資產總覽用「手動項目」記錄金額；功能上線後可以一鍵轉換。</p>
      </div>
    </div>
  );
}
