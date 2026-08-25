export type MenuOption = {
  /** Libellé de l’option (ex. Fromage, Boisson) */
  name: string;
  /** true = le client doit la prendre / choisir */
  required: boolean;
  /** Supplément en XOF (0 si gratuit) */
  price: number;
  /**
   * Variantes au choix (ex. ["Fanta", "Coca"]).
   * Si non vide : le client doit choisir EXACTEMENT une variante ;
   * on passe le nom de la variante dans add_to_cart options[].
   */
  choices?: string[];
};

export type MenuItemDto = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  available: boolean;
  options: MenuOption[];
};

export type MenuCategoryDto = {
  name: string;
  items: MenuItemDto[];
};

export type GetMenuResult = {
  categories: MenuCategoryDto[];
};

export type SelectedCartOption = {
  /** Nom de l’option menu (parent) */
  name: string;
  price: number;
  /** Variante choisie si l’option a des choices[] */
  choice?: string | null;
};
