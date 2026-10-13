import React, { useEffect, useState } from 'react';
import { ImagePlus, RotateCw } from 'lucide-react';
import { VocabVisual } from '../../../shared/contracts/vocab';

interface DefinitionVisualProps {
  definitionId: string;
}

export const DefinitionVisual: React.FC<DefinitionVisualProps> = ({ definitionId }) => {
  const [visual, setVisual] = useState<VocabVisual | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setVisual(null);
    setError(null);
    void window.studydockBridge.vocabGetVisual(definitionId)
      .then(result => { if (active) setVisual(result); })
      .catch(() => { if (active) setError('Could not load the saved visual.'); });
    return () => { active = false; };
  }, [definitionId]);

  const generate = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.studydockBridge.vocabGenerateVisual(definitionId, refresh);
      setVisual(result);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not generate a visual.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="definition-visual">
    {visual && <figure>
      <img src={visual.dataUrl} alt={visual.caption} />
      <figcaption>{visual.caption}</figcaption>
    </figure>}
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void generate(Boolean(visual))} disabled={loading}>
      {visual ? <RotateCw size={15} /> : <ImagePlus size={15} />}
      {loading ? 'Generating visual…' : visual ? 'Regenerate visual' : 'Create real-life visual'}
    </button>
    {!visual && <p className="definition-visual-note">Uses Gemini image generation and saves the result for offline viewing.</p>}
    {error && <p role="alert" className="pronunciation-error">{error}</p>}
  </div>;
};
