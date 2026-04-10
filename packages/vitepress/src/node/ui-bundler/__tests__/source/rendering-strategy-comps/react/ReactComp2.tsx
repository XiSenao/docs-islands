import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc2.css';

export function ReactComp2(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp2-demo">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong>{' '}
          <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button
            className="rc2-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>Pre-rendering Mode Only, React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
