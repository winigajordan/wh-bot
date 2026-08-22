export type MenuItemDto = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  available: boolean;
  options: unknown[];
};

export type MenuCategoryDto = {
  name: string;
  items: MenuItemDto[];
};

export type GetMenuResult = {
  categories: MenuCategoryDto[];
};
