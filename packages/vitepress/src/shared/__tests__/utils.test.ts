/**
 * @vitest-environment jsdom
 */
import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/vitepress-shared/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateLegalRenderElements } from '../utils';

vi.mock('@docs-islands/vitepress-utils/logger', () => ({
  default: {
    getLoggerByGroup: () => ({
      warn: vi.fn(),
    }),
  },
}));

describe('Shared Utils - validateLegalRenderElements Simple', () => {
  let mockElement: Element;

  beforeEach(() => {
    mockElement = document.createElement('div');
    vi.clearAllMocks();
  });

  it('should validate element with all required attributes', () => {
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
      '12345678',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
      'TestComponent',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
      'client:load',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
      'true',
    );

    const result = validateLegalRenderElements(mockElement);

    expect(result).toBe(true);
  });

  it('should reject element with missing attributes', () => {
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
      '12345678',
    );

    const result = validateLegalRenderElements(mockElement);

    expect(result).toBe(false);
  });
});
