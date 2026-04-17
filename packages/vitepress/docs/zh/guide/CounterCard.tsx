import './CounterCard.css';

export default function CounterCard() {
  return (
    <section className="counter-card">
      <div className="counter-card__eyebrow">
        <span className="counter-card__dot" />
        快速上手示例
      </div>
      <h3 className="counter-card__title">你好，Docs Islands</h3>
      <p className="counter-card__body">
        你的第一个 React 组件已经成功渲染在这篇 VitePress 页面里。
      </p>
    </section>
  );
}
