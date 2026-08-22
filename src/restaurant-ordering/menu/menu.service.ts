import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUuid } from '../../common/uuid.util';
import { MenuItem } from './entities/menu-item.entity';
import { GetMenuResult, MenuCategoryDto, MenuItemDto } from './menu.types';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
  ) {}

  async getMenu(
    businessId: string,
    category?: string,
  ): Promise<GetMenuResult> {
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

    const items = await qb.getMany();
    return { categories: this.groupByCategory(items) };
  }

  async createItem(
    businessId: string,
    data: {
      category: string;
      name: string;
      price: number;
      description?: string | null;
      available?: boolean;
      options?: unknown[];
    },
  ): Promise<MenuItem> {
    return this.menuItemRepo.save(
      this.menuItemRepo.create({
        businessId,
        category: data.category,
        name: data.name,
        price: data.price.toFixed(2),
        description: data.description ?? null,
        available: data.available ?? true,
        options: data.options ?? [],
      }),
    );
  }

  async setAvailability(
    businessId: string,
    itemId: string,
    available: boolean,
  ): Promise<MenuItem | null> {
    const item = await this.menuItemRepo.findOneBy({
      id: itemId,
      businessId,
    });
    if (!item) {
      return null;
    }
    item.available = available;
    return this.menuItemRepo.save(item);
  }

  async findById(
    businessId: string,
    itemId: string,
  ): Promise<MenuItem | null> {
    if (!isUuid(itemId)) {
      return null;
    }
    return this.menuItemRepo.findOneBy({ id: itemId, businessId });
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
    return {
      id: item.id,
      name: item.name,
      price: Number(item.price),
      description: item.description,
      available: item.available,
      options: Array.isArray(item.options) ? item.options : [],
    };
  }
}
