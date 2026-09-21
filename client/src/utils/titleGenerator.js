const colors = ['Red', 'Yellow', 'Brown', 'Pink', 'Purple', 'Blue', 'White', 'Gray'];
const animals = ['Cat', 'Dog', 'Panther', 'Elephant', 'Wasp', 'Gorilla', 'Monkey', 'Armadillo', 'Blobfish', 'Gecko'];

export const generateRandomTitle = () => {
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  return `${randomColor} ${randomAnimal}`;
};

export const getRandomTitleSuggestion = () => {
  return generateRandomTitle();
};