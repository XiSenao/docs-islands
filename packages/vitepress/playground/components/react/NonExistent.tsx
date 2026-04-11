import * as React from 'react';

export default function NonExistent(): JSX.Element {
  return (
    <React.Fragment>
      <div data-testid="non-existent">
        <p>
          This component was missing but is now available for testing error
          recovery
        </p>
      </div>
    </React.Fragment>
  );
}
