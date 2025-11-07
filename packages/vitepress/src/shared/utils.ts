import type { RenderDirective } from '#dep-types/render';
import {
  ALLOWED_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import logger from '#shared/logger';

/**
 * TODO: The props for the container are passed as strings after being parsed by the Vue engine.
 * Therefore, we need to pre-parse the data types provided by the user to the Vue engine
 * before Vue's own parsing.
 *
 * This will enhance the diversity of prop types for the rendered component while maintaining compatibility with Vue's semantics.
 *
 * For example, the user can pass a number to the container, and the Vue engine will parse it as a string.
 * But we need to pre-parse it as a number before Vue's own parsing, then pass it to the rendered component.
 *
 * @param element - The element to validate.
 */
export const validateLegalRenderElements = (element: Element): boolean => {
  const Logger = logger.getLoggerByGroup('validate-legal-render-elements');
  const renderStrategyProps: Record<string, string> = {};

  // Must include all render strategy attrs.
  const missingRenderStrategyAttrs = RENDER_STRATEGY_ATTRS.filter((attr) => {
    if (element.hasAttribute(attr)) {
      renderStrategyProps[attr] = element.getAttribute(attr) || '';
      return false;
    }
    return true;
  });
  if (missingRenderStrategyAttrs.length > 0) {
    Logger.warn(
      `The element is missing rendering attributes: ${missingRenderStrategyAttrs.join(', ')}, skipping compilation.`,
    );
    return false;
  }

  const renderId =
    renderStrategyProps[RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()];
  if (!/^[\da-f]{8}$/i.test(renderId)) {
    Logger.warn(
      `The element with renderId: [${renderId}] is not a valid renderId, skipping compilation.`,
    );
    return false;
  }

  // Component name must be in PascalCase.
  const renderComponent =
    renderStrategyProps[
      RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()
    ];
  if (!/^[A-Z][\dA-Za-z]*$/.test(renderComponent)) {
    Logger.warn(
      `The element with renderComponent: [${renderComponent}] is not a valid component name, component name must be in PascalCase, skipping compilation.`,
    );
    return false;
  }

  // Render directive must be one of the allowed directives.
  const renderDirective =
    renderStrategyProps[
      RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase()
    ];
  if (!ALLOWED_RENDER_DIRECTIVES.includes(renderDirective as RenderDirective)) {
    Logger.warn(
      `The element with renderDirective: [${renderDirective}] is not a valid render directive, allowed render directives: ${ALLOWED_RENDER_DIRECTIVES.join(', ')}, skipping compilation.`,
    );
    return false;
  }

  return true;
};
