import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, RotateCw, Trash2, Upload, X } from 'lucide-react';
import { VocabVisual } from '../../../shared/contracts/vocab';

interface DefinitionVisualProps {
  definitionId: string;
}

interface VisualLightboxProps {
  visual: VocabVisual;
  onClose: () => void;
}

export const VisualLightbox: React.FC<VisualLightboxProps> = ({ visual, onClose }) => <div className="visual-lightbox-backdrop" onClick={onClose}>
  <section className="visual-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged vocabulary image" onClick={event => event.stopPropagation()}>
    <button type="button" className="btn btn-secondary btn-sm visual-lightbox-close" aria-label="Close enlarged image" onClick={onClose} autoFocus>
      <X size={18} /> Close
    </button>
    <figure>
      <img src={visual.dataUrl} alt={visual.caption} />
      <figcaption>{visual.caption}</figcaption>
    </figure>
  </section>
</div>;

export const DefinitionVisual: React.FC<DefinitionVisualProps> = ({ definitionId }) => {
  const [visual, setVisual] = useState<VocabVisual | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ fileName: string; dataUrl: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const currentDefinitionId = useRef(definitionId);
  currentDefinitionId.current = definitionId;

  useEffect(() => {
    let active = true;
    setVisual(null);
    setError(null);
    setPendingUpload(null);
    setLoading(false);
    setExpanded(false);
    void window.studydockBridge.vocabGetVisual(definitionId)
      .then(result => { if (active) setVisual(result); })
      .catch(() => { if (active) setError('Could not load the saved visual.'); });
    return () => { active = false; };
  }, [definitionId]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
        imageButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  const closeExpanded = () => {
    setExpanded(false);
    imageButton.current?.focus();
  };

  const generate = async (refresh: boolean) => {
    const requestedId = definitionId;
    setLoading(true);
    setError(null);
    try {
      const result = await window.studydockBridge.vocabGenerateVisual(definitionId, refresh);
      if (currentDefinitionId.current === requestedId) setVisual(result);
    } catch (caught: unknown) {
      if (currentDefinitionId.current === requestedId) setError(caught instanceof Error ? caught.message : 'Could not generate a visual.');
    } finally {
      if (currentDefinitionId.current === requestedId) setLoading(false);
    }
  };

  const selectImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image smaller than 10 MB.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this image.'));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(file);
      });
      if (currentDefinitionId.current === definitionId) {
        setPendingUpload({ fileName: file.name, dataUrl });
        setCaption('');
      }
    } catch (caught: unknown) {
      if (currentDefinitionId.current === definitionId) setError(caught instanceof Error ? caught.message : 'Could not read this image.');
    }
  };

  const saveUpload = async () => {
    if (!pendingUpload) return;
    const requestedId = definitionId;
    setLoading(true);
    setError(null);
    try {
      const saved = await window.studydockBridge.vocabUploadVisual(definitionId, pendingUpload.dataUrl, caption);
      if (currentDefinitionId.current === requestedId) {
        setVisual(saved);
        setPendingUpload(null);
      }
    } catch (caught: unknown) {
      if (currentDefinitionId.current === requestedId) setError(caught instanceof Error ? caught.message : 'Could not save this image.');
    } finally {
      if (currentDefinitionId.current === requestedId) setLoading(false);
    }
  };

  const removeVisual = async () => {
    if (!window.confirm('Remove this saved image from this meaning?')) return;
    const requestedId = definitionId;
    setLoading(true);
    setError(null);
    try {
      await window.studydockBridge.vocabDeleteVisual(definitionId);
      if (currentDefinitionId.current === requestedId) setVisual(null);
    } catch (caught: unknown) {
      if (currentDefinitionId.current === requestedId) setError(caught instanceof Error ? caught.message : 'Could not remove this image.');
    } finally {
      if (currentDefinitionId.current === requestedId) setLoading(false);
    }
  };

  return <div className="definition-visual">
    {visual && <figure>
      <button ref={imageButton} type="button" className="definition-visual-enlarge" aria-label="Enlarge image" onClick={() => setExpanded(true)}>
        <img src={visual.dataUrl} alt={visual.caption} />
      </button>
      <figcaption>{visual.caption}</figcaption>
    </figure>}
    {visual && expanded && createPortal(<VisualLightbox visual={visual} onClose={closeExpanded} />, document.body)}
    <div className="definition-visual-actions">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void generate(Boolean(visual))} disabled={loading}>
        {visual ? <RotateCw size={15} /> : <ImagePlus size={15} />}
        {loading ? 'Working…' : visual ? 'Regenerate visual' : 'Create real-life visual'}
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={loading}>
        <Upload size={15} /> {visual ? 'Replace with image' : 'Upload image'}
      </button>
      {visual && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void removeVisual()} disabled={loading}>
        <Trash2 size={15} /> Remove image
      </button>}
    </div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="definition-visual-file" aria-label="Choose a vocabulary image" onChange={event => {
      void selectImage(event.target.files?.[0]);
      event.target.value = '';
    }} />
    {pendingUpload && <div className="definition-visual-preview">
      <p>Preview: {pendingUpload.fileName}</p>
      <img src={pendingUpload.dataUrl} alt="Selected image preview" />
      <label htmlFor={`visual-caption-${definitionId}`}>Caption (optional)</label>
      <input id={`visual-caption-${definitionId}`} type="text" maxLength={240} value={caption} onChange={event => setCaption(event.target.value)} placeholder="Describe how this image shows the meaning" />
      <div className="definition-visual-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveUpload()} disabled={loading}>Save image</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPendingUpload(null)} disabled={loading}><X size={15} /> Cancel</button>
      </div>
    </div>}
    {!visual && !pendingUpload && <p className="definition-visual-note">Generate a visual with Gemini or add your own image. Both are saved locally for offline viewing.</p>}
    {error && <p role="alert" className="pronunciation-error">{error}</p>}
  </div>;
};
