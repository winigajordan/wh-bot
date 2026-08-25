export type MenuOptionChoice = {
  /** Libellé de la variante (ex. MM, GM, Fanta, Sandwich) */
  name: string;
  /**
   * Supplément en XOF par rapport au prix de base du plat.
   * Ex. pizza base 5500 (MM) → GM avec price: 500 → total 6000.
   */
  price: number;
};

export type MenuOption = {
  /** Libellé de l’option (ex. Fromage, Boisson, Taille) */
  name: string;
  /** true = le client doit la prendre / choisir */
  required: boolean;
  /**
   * Supplément en XOF si option simple (sans choices).
   * Ignoré si choices[] est non vide (le prix vient alors du choix).
   */
  price: number;
  /**
   * Variantes au choix (ex. taille MM/GM, boisson Fanta/Coca).
   * Si non vide : le client doit choisir EXACTEMENT une variante ;
   * on passe le nom de la variante dans add_to_cart options[].
   */
  choices?: MenuOptionChoice[];
};

export type MenuItemDto = {
  id: string;
  name: string;
  price: number;
  /** Prix lisible WhatsApp (inclut les variantes si présentes) */
  price_label: string;
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
