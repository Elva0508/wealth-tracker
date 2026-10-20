import { Page } from '../components/Page';

export function ComingSoonPage({ title, stage, description }: { title: string; stage: string; description: string }) {
  return (
    <Page title={title} largeTitle>
      <section className="list-group">
        <h2 className="list-group__label">{stage} 即將推出</h2>
        <div className="list">
          <p className="list-row list-row--text">{description}</p>
        </div>
        <p className="list-group__note">在那之前，請先在資產總覽用「手動項目」記錄金額；功能上線後可以一鍵轉換。</p>
      </section>
    </Page>
  );
}
