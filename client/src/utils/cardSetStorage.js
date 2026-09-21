// Storage keys
const CARD_SET_KEY = 'planningpoker_cardset';
const CARD_SET_TYPE_KEY = 'planningpoker_cardset_type';

/**
 * Save the user's preferred card set to localStorage
 * @param {Array} cardSet - The card values
 * @param {string} type - The type of card set ('fibonacci', 'modifiedFibonacci', etc., or 'custom')
 */
export const saveCardSetPreference = (cardSet, type = 'fibonacci') => {
  try {
    localStorage.setItem(CARD_SET_KEY, JSON.stringify(cardSet));
    localStorage.setItem(CARD_SET_TYPE_KEY, type);
  } catch (error) {
    console.warn('Failed to save card set preference:', error);
  }
};

/**
 * Get the user's preferred card set from localStorage
 * @returns {Object|null} { cardSet: Array, type: string } or null if not found
 */
export const getCardSetPreference = () => {
  try {
    const cardSet = localStorage.getItem(CARD_SET_KEY);
    const type = localStorage.getItem(CARD_SET_TYPE_KEY);
    
    if (cardSet) {
      return {
        cardSet: JSON.parse(cardSet),
        type: type || 'custom'
      };
    }
    return null;
  } catch (error) {
    console.warn('Failed to get card set preference:', error);
    return null;
  }
};

/**
 * Clear the card set preference from localStorage
 */
export const clearCardSetPreference = () => {
  try {
    localStorage.removeItem(CARD_SET_KEY);
    localStorage.removeItem(CARD_SET_TYPE_KEY);
  } catch (error) {
    console.warn('Failed to clear card set preference:', error);
  }
};
