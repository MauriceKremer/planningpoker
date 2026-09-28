const colors: [string, ...string[]] = ['Red', 'Yellow', 'Brown', 'Pink', 'Purple', 'Blue', 'White', 'Gray'];
const animals: [string, ...string[]] = ['Cat', 'Dog', 'Panther', 'Elephant', 'Wasp', 'Gorilla', 'Monkey', 'Armadillo', 'Blobfish', 'Gecko'];

const pick = (list: [string, ...string[]]): string =>
  list[Math.floor(Math.random() * list.length)] ?? list[0];

export const generateRandomTitle = (): string => {
  const randomColor = pick(colors);
  const randomAnimal = pick(animals);
  return `${randomColor} ${randomAnimal}`;
};

export const getRandomTitleSuggestion = (): string => {
  return generateRandomTitle();
};