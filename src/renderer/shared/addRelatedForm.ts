import { StudyDockAPI } from '../../shared/contracts/ipc';
import { VocabWordWithDefinitions } from '../../shared/contracts/vocab';

type RelatedFormBridge = Pick<StudyDockAPI, 'vocabVerifyAndAddWord' | 'vocabGetWordDetails'>;

export type AddRelatedFormResult =
  | { status: 'opened'; details: VocabWordWithDefinitions; added: boolean }
  | { status: 'error'; message: string };

export async function addRelatedFormToLibrary(
  bridge: RelatedFormBridge,
  form: string,
  language: string
): Promise<AddRelatedFormResult> {
  const result = await bridge.vocabVerifyAndAddWord({ word: form, language });

  if (result.status === 'added' || result.status === 'duplicate') {
    const details = await bridge.vocabGetWordDetails(result.word.id);
    if (!details) {
      return { status: 'error', message: `“${form}” is in Word Library, but its card could not be opened. Find it in Word Library.` };
    }
    return { status: 'opened', details, added: result.status === 'added' };
  }

  if (result.status === 'suggestions') {
    return { status: 'error', message: `Gemini could not verify “${form}” as written. Try ${result.suggestions.map(word => `“${word}”`).join(' or ')} in Word Library.` };
  }
  if (result.status === 'unrecognized') {
    return { status: 'error', message: `Gemini could not verify “${form}” as a word. It was not added.` };
  }
  return { status: 'error', message: `Could not add “${form}”: ${result.message}` };
}
