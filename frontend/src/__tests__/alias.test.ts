// src/__tests__/alias.test.ts
import { render } from '@testing-library/react';
import { ConfigErrorScreen } from '@/components/organisms/config-error-screen';
import React from 'react';

describe('Alias resolution', () => {
  test('ConfigErrorScreen should be imported correctly via @ alias', () => {
    expect(ConfigErrorScreen).toBeDefined();
  });

  test('ConfigErrorScreen should render without crashing', () => {
    const { container } = render(
      React.createElement(ConfigErrorScreen, { issues: ['Test warning'] }),
    );
    expect(container).toBeTruthy();
  });
});