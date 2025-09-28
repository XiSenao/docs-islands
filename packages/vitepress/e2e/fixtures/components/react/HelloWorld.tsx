import { useState } from 'react';

export default function HelloWorld(props: { uniqueid?: string }): JSX.Element {
  const { uniqueid = 'default-unique-id' } = props;
  const [count, setCount] = useState(0);

  return (
    <div data-testid="hello-world" data-unique-id={uniqueid}>
      <h2>Hello World Component</h2>
      <button data-testid="counter-button" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
