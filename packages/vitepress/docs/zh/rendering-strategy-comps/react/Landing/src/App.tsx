import { type JSX, useState } from 'react';
import vitepressLogo from '../public/vitepress.svg';
import './App.css';
import reactLogo from './assets/react.svg';

function App(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div className="landing">
      <div className="logo-container">
        <a href="https://vitepress.dev" target="_blank" rel="noreferrer">
          <img src={vitepressLogo} className="logo" alt="VitePress logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>VitePress + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          点击次数: {count}
        </button>
      </div>
    </div>
  );
}

export default App;
