const CARD_SET_KEY = 'planningpoker_cardset';
const CARD_SET_TYPE_KEY = 'planningpoker_cardset_type';

/** The user's preferred card set as stored in localStorage. */
export interface CardSetPreference {
  cardSet: string[];
  type: string;
}

export const saveCardSetPreference = (cardSet: string[], type: string = 'fibonacci'): void => {
  try {
    localStorage.setItem(CARD_SET_KEY, JSON.stringify(cardSet));
    localStorage.setItem(CARD_SET_TYPE_KEY, type);
  } catch (error) {
    console.warn('Failed to save card set preference:', error);
  }
};

/**
 * Get the user's preferred card set from localStorage. Returns null when the
 * stored value is absent or not a string array (never trusts the raw parse).
 */
export const getCardSetPreference = (): CardSetPreference | null => {
  try {
    const cardSet = localStorage.getItem(CARD_SET_KEY);
    const type = localStorage.getItem(CARD_SET_TYPE_KEY);

    if (cardSet) {
      const parsed: unknown = JSON.parse(cardSet);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
        return { cardSet: parsed, type: type || 'custom' };
      }
      return null;
    }
    return null;
  } catch (error) {
    console.warn('Failed to get card set preference:', error);
    return null;
  }
};

export const clearCardSetPreference = (): void => {
  try {
    localStorage.removeItem(CARD_SET_KEY);
    localStorage.removeItem(CARD_SET_TYPE_KEY);
  } catch (error) {
    console.warn('Failed to clear card set preference:', error);
  }
};