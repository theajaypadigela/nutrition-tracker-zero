import type { Meal } from '@/api/types';

/**
 * The foods many people have at a meal, with the amount they usually have: what the log screen offers when a person has nothing logged
 * for that meal yet (and only then). Names and amounts only. Nutrient values are entered by people from a label or a database and never
 * guessed, so a food from this list counts once someone has added its values, like any food a person types in.
 */
export interface CommonFood {
  /** The name the Worker files the food under (`normalizeName` in the Worker: lowercase, last word singular). A test keeps them equal. */
  key: string;
  /** How it reads on screen, and what is sent when it is logged. */
  name: string;
  quantity: number;
  unit: string;
}

const food = (key: string, name: string, quantity: number, unit: string): CommonFood => ({ key, name, quantity, unit });

/** Most common first. */
export const COMMON_FOODS: Record<Meal, CommonFood[]> = {
  breakfast: [
    food('idli', 'Idli', 2, 'piece'),
    food('dosa', 'Dosa', 1, 'piece'),
    food('upma', 'Upma', 1, 'katori'),
    food('poha', 'Poha', 1, 'katori'),
    food('paratha', 'Paratha', 1, 'piece'),
    food('bread', 'Bread', 2, 'slice'),
    food('boiled egg', 'Boiled egg', 2, 'piece'),
    food('omelette', 'Omelette', 1, 'piece'),
    food('oats', 'Oats', 1, 'bowl'),
    food('milk', 'Milk', 1, 'glass'),
    food('tea', 'Tea', 1, 'cup'),
    food('coffee', 'Coffee', 1, 'cup'),
    food('banana', 'Banana', 1, 'piece'),
    food('curd', 'Curd', 1, 'katori'),
    food('sambar', 'Sambar', 1, 'katori'),
    food('cornflake', 'Cornflakes', 1, 'bowl'),
  ],
  lunch: [
    food('rice', 'Rice', 1, 'katori'),
    food('roti', 'Roti', 2, 'piece'),
    food('dal', 'Dal', 1, 'katori'),
    food('sambar', 'Sambar', 1, 'katori'),
    food('vegetable curry', 'Vegetable curry', 1, 'katori'),
    food('rajma', 'Rajma', 1, 'katori'),
    food('chole', 'Chole', 1, 'katori'),
    food('paneer curry', 'Paneer curry', 1, 'katori'),
    food('chicken curry', 'Chicken curry', 1, 'katori'),
    food('fish curry', 'Fish curry', 1, 'katori'),
    food('egg curry', 'Egg curry', 1, 'katori'),
    food('curd', 'Curd', 1, 'katori'),
    food('salad', 'Salad', 1, 'bowl'),
    food('khichdi', 'Khichdi', 1, 'bowl'),
    food('biryani', 'Biryani', 1, 'plate'),
    food('curd rice', 'Curd rice', 1, 'bowl'),
    food('papad', 'Papad', 1, 'piece'),
    food('buttermilk', 'Buttermilk', 1, 'glass'),
  ],
  snack: [
    food('tea', 'Tea', 1, 'cup'),
    food('coffee', 'Coffee', 1, 'cup'),
    food('biscuit', 'Biscuits', 2, 'piece'),
    food('banana', 'Banana', 1, 'piece'),
    food('apple', 'Apple', 1, 'piece'),
    food('samosa', 'Samosa', 1, 'piece'),
    food('almond', 'Almonds', 10, 'piece'),
    food('peanut', 'Peanuts', 30, 'g'),
    food('roasted chana', 'Roasted chana', 1, 'katori'),
    food('murmura', 'Murmura', 1, 'katori'),
    food('sprout', 'Sprouts', 1, 'katori'),
    food('fruit salad', 'Fruit salad', 1, 'bowl'),
    food('buttermilk', 'Buttermilk', 1, 'glass'),
    food('lassi', 'Lassi', 1, 'glass'),
    food('juice', 'Juice', 1, 'glass'),
    food('coconut water', 'Coconut water', 1, 'glass'),
    food('date', 'Dates', 2, 'piece'),
    food('cookie', 'Cookies', 2, 'piece'),
  ],
  dinner: [
    food('roti', 'Roti', 2, 'piece'),
    food('rice', 'Rice', 1, 'katori'),
    food('dal', 'Dal', 1, 'katori'),
    food('vegetable curry', 'Vegetable curry', 1, 'katori'),
    food('khichdi', 'Khichdi', 1, 'bowl'),
    food('paneer curry', 'Paneer curry', 1, 'katori'),
    food('chicken curry', 'Chicken curry', 1, 'katori'),
    food('egg curry', 'Egg curry', 1, 'katori'),
    food('fish curry', 'Fish curry', 1, 'katori'),
    food('curd', 'Curd', 1, 'katori'),
    food('soup', 'Soup', 1, 'bowl'),
    food('salad', 'Salad', 1, 'bowl'),
    food('dosa', 'Dosa', 1, 'piece'),
    food('idli', 'Idli', 3, 'piece'),
    food('upma', 'Upma', 1, 'katori'),
    food('pulao', 'Pulao', 1, 'plate'),
    food('milk', 'Milk', 1, 'glass'),
  ],
};
