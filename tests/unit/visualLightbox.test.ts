import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisualLightbox } from '../../src/renderer/modes/vocab/DefinitionVisual';

describe('Vocabulary image viewer', () => {
  it('renders the full image in an accessible dialog with a caption and close control', () => {
    const markup = renderToStaticMarkup(React.createElement(VisualLightbox, {
      visual: {
        definitionId: 'meaning-1',
        dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        caption: 'A person studying a diagram.',
        generatedAt: '2026-10-13T00:00:00.000Z'
      },
      onClose: () => {}
    }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Close enlarged image"');
    expect(markup).toContain('src="data:image/jpeg;base64,ZmFrZQ=="');
    expect(markup).toContain('<figcaption>A person studying a diagram.</figcaption>');
  });
});
