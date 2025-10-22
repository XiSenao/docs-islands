import { useState } from 'react';

export default function Hello(props: { uniqueid?: string }): JSX.Element {
  const { uniqueid = 'default-hello-id' } = props;
  const [count, setCount] = useState(0);

  return (
    <div data-testid="hello" data-unique-id={uniqueid}>
      <p>Hello Component</p>
      <button onClick={() => setCount(count + 1)}>Hello Count: {count}</button>
    </div>
  );
}
