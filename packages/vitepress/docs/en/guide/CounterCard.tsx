import './CounterCard.css';

export default function CounterCard() {
  return (
    <section className="counter-card">
      <div className="counter-card__eyebrow">
        <span className="counter-card__dot" />
        Getting started example
      </div>
      <h3 className="counter-card__title">Hello Docs Islands</h3>
      <p className="counter-card__body">
        Your first React component is already rendering inside this VitePress
        page.
      </p>
    </section>
  );
}
