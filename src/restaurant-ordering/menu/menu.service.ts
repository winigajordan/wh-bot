import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUuid } from '../../common/uuid.util';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import {
  GetMenuOptions,
  GetMenuResult,
  MenuCategoryDto,
  MenuItemDto,
  MenuOption,
  MenuOptionChoice,
  SelectedCartOption,
} from './menu.types';

export type DashboardMenuItemDto = {
  id: string;
  category: string;
  name: string;
  price: number;
  description: string | null;
  available: boolean;
  options: MenuOption[];
  created_at: string;
  updated_at: string;
};

export type DashboardMenuCategoryDto = {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type MenuItemWriteInput = {
  category?: string;
  name?: string;
  price?: number;
  description?: string | null;
  available?: boolean;
  options?: MenuOption[];
};

export type ResolveSelectedOptionsResult =
  | {
      success: true;
      options: SelectedCartOption[];
      extra: number;
    }
  | {
      success: false;
      reason: 'invalid_options';
      invalid: string[];
    }
  | {
      success: false;
      reason: 'missing_required_options';
      missing: string[];
    };

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly menuCategoryRepo: Repository<MenuCategory>,
    private readonly config: ConfigService,
  ) {}

  async getMenu(
    businessId: string,
    options: GetMenuOptions | string = {},
  ): Promise<GetMenuResult> {
    const normalized =
      typeof options === 'string' ? { category: options } : (options ?? {});
    const category = normalized.category?.trim() || undefined;
    const full = normalized.full === true;

    if (category) {
      const items = await this.queryItems(businessId, category);
      return {
        mode: 'items',
        categories: this.groupByCategory(items),
      };
    }

    const items = await this.queryItems(businessId);
    const grouped = this.groupByCategory(items);

    if (!full && this.shouldUseCategoryNavigation(grouped, items.length)) {
      return {
        mode: 'categories',
        total_items: items.length,
        categories: grouped.map((entry) =>
          this.toCategorySummary(entry.name, entry.items),
        ),
        hint: 'Pour chaque famille : UNE courte phrase descriptive du contenu, basée uniquement sur sample (noms + descriptions). Pas une liste de plats à virgules. Si has_more, laisse sentir qu’il y a d’autres choix. Vouvoiement. Pas de prix. N’utilise pas « catégorie » ni « section ». Demande ce qui intéresse. Puis get_menu avec category (nom exact). full:true seulement si carte complète demandée.',
      };
    }

    return {
      mode: 'full',
      categories: grouped,
    };
  }

  shouldUseCategoryNavigation(
    categories: Array<{ name: string; items: unknown[] }>,
    totalItems: number,
  ): boolean {
    const minItems = this.config.get<number>('menu.categoryNavMinItems') ?? 10;
    const minCategories =
      this.config.get<number>('menu.categoryNavMinCategories') ?? 3;
    return totalItems > minItems || categories.length > minCategories;
  }

  toCategorySummary(
    name: string,
    items: Array<{
      name: string;
      description: string | null;
      available?: boolean;
    }>,
    sampleSize = 5,
  ) {
    const preferred = items.filter((item) => item.available !== false);
    const source = preferred.length > 0 ? preferred : items;
    const sample = source.slice(0, sampleSize).map((item) => ({
      name: item.name,
      description: item.description,
    }));
    return {
      name,
      item_count: items.length,
      sample,
      has_more: source.length > sample.length,
    };
  }

  async listForBusiness(
    businessId: string,
    options: { category?: string } = {},
  ): Promise<DashboardMenuItemDto[]> {
    const items = await this.queryItems(businessId, options.category);
    return items.map((item) => this.toDashboardDto(item));
  }

  async listCategories(
    businessId: string,
  ): Promise<DashboardMenuCategoryDto[]> {
    const categories = await this.menuCategoryRepo.find({
      where: { businessId },
      order: { name: 'ASC' },
    });
    const items = await this.queryItems(businessId);
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.category.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      item_count: counts.get(category.name.trim().toLowerCase()) ?? 0,
      created_at: category.createdAt.toISOString(),
      updated_at: category.updatedAt.toISOString(),
    }));
  }

  async createCategory(
    businessId: string,
    name: string,
  ): Promise<DashboardMenuCategoryDto> {
    const trimmed = name.trim();
    const existing = await this.menuCategoryRepo
      .createQueryBuilder('category')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('LOWER(category.name) = LOWER(:name)', { name: trimmed })
      .getOne();

    if (existing) {
      throw new ConflictException('Cette catégorie existe déjà');
    }

    const category = await this.menuCategoryRepo.save(
      this.menuCategoryRepo.create({
        businessId,
        name: trimmed,
      }),
    );

    return {
      id: category.id,
      name: category.name,
      item_count: 0,
      created_at: category.createdAt.toISOString(),
      updated_at: category.updatedAt.toISOString(),
    };
  }

  async deleteCategory(
    businessId: string,
    categoryId: string,
  ): Promise<{ deleted: true } | null> {
    if (!isUuid(categoryId)) {
      return null;
    }

    const category = await this.menuCategoryRepo.findOneBy({
      id: categoryId,
      businessId,
    });
    if (!category) {
      return null;
    }

    const itemCount = await this.menuItemRepo
      .createQueryBuilder('item')
      .where('item.business_id = :businessId', { businessId })
      .andWhere('LOWER(item.category) = LOWER(:name)', { name: category.name })
      .getCount();

    if (itemCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${itemCount} article(s) utilisent encore cette catégorie`,
      );
    }

    await this.menuCategoryRepo.remove(category);
    return { deleted: true };
  }

  async createItem(
    businessId: string,
    data: {
      category: string;
      name: string;
      price: number;
      description?: string | null;
      available?: boolean;
      options?: MenuOption[];
    },
  ): Promise<MenuItem> {
    const categoryName = await this.ensureCategory(businessId, data.category);
    return this.menuItemRepo.save(
      this.menuItemRepo.create({
        businessId,
        category: categoryName,
        name: data.name.trim(),
        price: data.price.toFixed(2),
        description: data.description?.trim() || null,
        available: data.available ?? true,
        options: data.options ?? [],
      }),
    );
  }

  async updateItem(
    businessId: string,
    itemId: string,
    data: MenuItemWriteInput,
  ): Promise<MenuItem | null> {
    const item = await this.findById(businessId, itemId);
    if (!item) {
      return null;
    }

    if (data.category !== undefined) {
      item.category = await this.ensureCategory(businessId, data.category);
    }
    if (data.name !== undefined) {
      item.name = data.name.trim();
    }
    if (data.price !== undefined) {
      item.price = data.price.toFixed(2);
    }
    if (data.description !== undefined) {
      item.description =
        data.description === null ? null : data.description.trim() || null;
    }
    if (data.available !== undefined) {
      item.available = data.available;
    }
    if (data.options !== undefined) {
      item.options = data.options;
    }

    return this.menuItemRepo.save(item);
  }

  async setAvailability(
    businessId: string,
    itemId: string,
    available: boolean,
  ): Promise<MenuItem | null> {
    return this.updateItem(businessId, itemId, { available });
  }

  async clearAllItems(businessId: string): Promise<number> {
    const result = await this.menuItemRepo.delete({ businessId });
    return result.affected ?? 0;
  }

  async findById(businessId: string, itemId: string): Promise<MenuItem | null> {
    if (!isUuid(itemId)) {
      return null;
    }
    return this.menuItemRepo.findOneBy({ id: itemId, businessId });
  }

  toDashboardDto(item: MenuItem): DashboardMenuItemDto {
    return {
      id: item.id,
      category: item.category,
      name: item.name,
      price: Number(item.price),
      description: item.description,
      available: item.available,
      options: this.normalizeOptions(item.options),
      created_at: item.createdAt.toISOString(),
      updated_at: item.updatedAt.toISOString(),
    };
  }

  normalizeOptions(value: unknown): MenuOption[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const options: MenuOption[] = [];

    for (const entry of value) {
      let name = '';
      let required = false;
      let price = 0;
      let choices: MenuOptionChoice[] = [];

      if (typeof entry === 'string') {
        name = entry.trim();
      } else if (entry && typeof entry === 'object') {
        const raw = entry as Record<string, unknown>;
        if (typeof raw.name === 'string') {
          name = raw.name.trim();
        } else if (typeof raw.label === 'string') {
          name = raw.label.trim();
        }
        required = raw.required === true;
        const rawPrice =
          typeof raw.price === 'number' ? raw.price : Number(raw.price);
        price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;
        if (Array.isArray(raw.choices)) {
          choices = this.normalizeChoices(raw.choices);
        }
      }

      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push({
        name,
        required,
        // Si variantes : le supplément est sur chaque choix
        price: choices.length > 0 ? 0 : price,
        ...(choices.length > 0 ? { choices } : {}),
      });
    }

    return options;
  }

  normalizeChoices(value: unknown[]): MenuOptionChoice[] {
    const seen = new Set<string>();
    const choices: MenuOptionChoice[] = [];

    for (const entry of value) {
      let name = '';
      let price = 0;

      if (typeof entry === 'string') {
        name = entry.trim();
      } else if (entry && typeof entry === 'object') {
        const raw = entry as Record<string, unknown>;
        if (typeof raw.name === 'string') {
          name = raw.name.trim();
        } else if (typeof raw.label === 'string') {
          name = raw.label.trim();
        }
        const rawPrice =
          typeof raw.price === 'number' ? raw.price : Number(raw.price);
        if (Number.isFinite(rawPrice) && rawPrice > 0) {
          price = rawPrice;
        }
      }

      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      choices.push({ name, price });
    }

    return choices;
  }

  /**
   * À partir de variantes à prix absolus (ex. MM:5500, GM:6000),
   * produit un prix de base (= min) + option required avec suppléments.
   */
  variantsToOption(
    variants: Array<{ name: string; price: number }>,
    optionName = 'Format',
  ): { basePrice: number; option: MenuOption } | null {
    const cleaned = variants
      .map((variant) => ({
        name: variant.name.trim(),
        price: variant.price,
      }))
      .filter(
        (variant) =>
          variant.name && Number.isFinite(variant.price) && variant.price >= 0,
      );

    if (cleaned.length < 2) {
      return null;
    }

    const basePrice = Math.min(...cleaned.map((variant) => variant.price));
    return {
      basePrice,
      option: {
        name: optionName.trim() || 'Format',
        required: true,
        price: 0,
        choices: cleaned.map((variant) => ({
          name: variant.name,
          price: Math.max(0, variant.price - basePrice),
        })),
      },
    };
  }

  /**
   * Valide les options choisies contre le menu.
   * - option simple : passer son name
   * - option avec choices[] : passer le nom d’UNE variante (ex. "Fanta", "GM")
   */
  resolveSelectedOptions(
    menuOptionsRaw: unknown,
    selectedRaw: unknown[],
  ): ResolveSelectedOptionsResult {
    const menuOptions = this.normalizeOptions(menuOptionsRaw);
    const selectedTokens = selectedRaw
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry === 'object') {
          const raw = entry as Record<string, unknown>;
          if (typeof raw.choice === 'string' && raw.choice.trim()) {
            return raw.choice.trim();
          }
          if (typeof raw.name === 'string') {
            return raw.name.trim();
          }
        }
        return '';
      })
      .filter(Boolean);

    type Match = {
      option: MenuOption;
      choice: string | null;
      price: number;
    };
    const tokenToMatch = new Map<string, Match>();
    for (const option of menuOptions) {
      const choices = option.choices ?? [];
      if (choices.length > 0) {
        for (const choice of choices) {
          tokenToMatch.set(choice.name.toLowerCase(), {
            option,
            choice: choice.name,
            price: choice.price,
          });
        }
      } else {
        tokenToMatch.set(option.name.toLowerCase(), {
          option,
          choice: null,
          price: option.price,
        });
      }
    }

    const selected: SelectedCartOption[] = [];
    const coveredParents = new Set<string>();
    const invalid: string[] = [];

    for (const token of selectedTokens) {
      const match = tokenToMatch.get(token.toLowerCase());
      if (!match) {
        invalid.push(token);
        continue;
      }
      const parentKey = match.option.name.toLowerCase();
      if (coveredParents.has(parentKey)) {
        invalid.push(token);
        continue;
      }
      coveredParents.add(parentKey);
      selected.push({
        name: match.option.name,
        price: match.price,
        choice: match.choice,
      });
    }

    if (invalid.length > 0) {
      return { success: false, reason: 'invalid_options', invalid };
    }

    const missing = menuOptions
      .filter(
        (option) =>
          option.required && !coveredParents.has(option.name.toLowerCase()),
      )
      .map((option) =>
        option.choices && option.choices.length > 0
          ? `${option.name} (${option.choices.map((c) => c.name).join(' | ')})`
          : option.name,
      );

    if (missing.length > 0) {
      return { success: false, reason: 'missing_required_options', missing };
    }

    const extra = selected.reduce((sum, option) => sum + option.price, 0);
    return { success: true, options: selected, extra };
  }

  private async ensureCategory(
    businessId: string,
    name: string,
  ): Promise<string> {
    const trimmed = name.trim();
    const existing = await this.menuCategoryRepo
      .createQueryBuilder('category')
      .where('category.business_id = :businessId', { businessId })
      .andWhere('LOWER(category.name) = LOWER(:name)', { name: trimmed })
      .getOne();

    if (existing) {
      return existing.name;
    }

    const created = await this.menuCategoryRepo.save(
      this.menuCategoryRepo.create({
        businessId,
        name: trimmed,
      }),
    );
    return created.name;
  }

  private async queryItems(
    businessId: string,
    category?: string,
  ): Promise<MenuItem[]> {
    const qb = this.menuItemRepo
      .createQueryBuilder('item')
      .where('item.business_id = :businessId', { businessId })
      .orderBy('item.category', 'ASC')
      .addOrderBy('item.name', 'ASC');

    if (category?.trim()) {
      qb.andWhere('LOWER(item.category) = LOWER(:category)', {
        category: category.trim(),
      });
    }

    return qb.getMany();
  }

  private groupByCategory(items: MenuItem[]): MenuCategoryDto[] {
    const byCategory = new Map<string, MenuItemDto[]>();

    for (const item of items) {
      const dto = this.toDto(item);
      const list = byCategory.get(item.category) ?? [];
      list.push(dto);
      byCategory.set(item.category, list);
    }

    return Array.from(byCategory.entries()).map(([name, categoryItems]) => ({
      name,
      items: categoryItems,
    }));
  }

  private toDto(item: MenuItem): MenuItemDto {
    const price = Number(item.price);
    const options = this.normalizeOptions(item.options);
    return {
      id: item.id,
      name: item.name,
      price,
      price_label: this.formatItemPriceLabel(price, options),
      description: item.description,
      available: item.available,
      options,
    };
  }

  formatItemPriceLabel(basePrice: number, options: MenuOption[]): string {
    const variantOption =
      options.find(
        (option) =>
          option.required && option.choices && option.choices.length > 0,
      ) ??
      options.find((option) => option.choices && option.choices.length > 0);

    if (variantOption?.choices && variantOption.choices.length > 0) {
      return variantOption.choices
        .map(
          (choice) =>
            `${choice.name} ${this.formatXof(basePrice + choice.price)}`,
        )
        .join(' · ');
    }

    return this.formatXof(basePrice);
  }

  formatXof(amount: number): string {
    const value = Number.isFinite(amount) ? Math.round(amount) : 0;
    return `${value.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} F`;
  }
}
