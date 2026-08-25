import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  MenuService,
  type MenuItemWriteInput,
} from '../../restaurant-ordering/menu/menu.service';

@Controller('dashboard/menu')
@UseGuards(JwtAuthGuard)
export class DashboardMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('categories')
  async listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.menuService.listCategories(user.businessId);
  }

  @Post('categories')
  async createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const name =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).name
        : undefined;

    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('name requis (string non vide)');
    }

    return this.menuService.createCategory(user.businessId, name);
  }

  @Delete('categories/:id')
  async deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const result = await this.menuService.deleteCategory(user.businessId, id);
    if (!result) {
      throw new NotFoundException('Catégorie introuvable');
    }
    return result;
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: string,
  ) {
    return this.menuService.listForBusiness(user.businessId, { category });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const input = this.parseCreateBody(body);
    const item = await this.menuService.createItem(user.businessId, input);
    return this.menuService.toDashboardDto(item);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = this.parseUpdateBody(body);
    const item = await this.menuService.updateItem(
      user.businessId,
      id,
      input,
    );
    if (!item) {
      throw new NotFoundException('Article introuvable');
    }
    return this.menuService.toDashboardDto(item);
  }

  @Patch(':id/availability')
  @HttpCode(200)
  async setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const available =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).available
        : undefined;

    if (typeof available !== 'boolean') {
      throw new BadRequestException('available (boolean) requis');
    }

    const item = await this.menuService.setAvailability(
      user.businessId,
      id,
      available,
    );
    if (!item) {
      throw new NotFoundException('Article introuvable');
    }
    return this.menuService.toDashboardDto(item);
  }

  private parseCreateBody(body: unknown): {
    category: string;
    name: string;
    price: number;
    description?: string | null;
    available?: boolean;
    options?: ReturnType<MenuService['normalizeOptions']>;
  } {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body JSON requis');
    }

    const raw = body as Record<string, unknown>;
    const category = this.readRequiredString(raw.category, 'category');
    const name = this.readRequiredString(raw.name, 'name');
    const price = this.readPrice(raw.price);

    return {
      category,
      name,
      price,
      description: this.readOptionalDescription(raw.description),
      available:
        raw.available === undefined
          ? undefined
          : this.readBoolean(raw.available, 'available'),
      options: this.readOptionalOptions(raw.options),
    };
  }

  private parseUpdateBody(body: unknown): MenuItemWriteInput {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body JSON requis');
    }

    const raw = body as Record<string, unknown>;
    const input: MenuItemWriteInput = {};

    if (raw.category !== undefined) {
      input.category = this.readRequiredString(raw.category, 'category');
    }
    if (raw.name !== undefined) {
      input.name = this.readRequiredString(raw.name, 'name');
    }
    if (raw.price !== undefined) {
      input.price = this.readPrice(raw.price);
    }
    if (raw.description !== undefined) {
      input.description = this.readOptionalDescription(raw.description);
    }
    if (raw.available !== undefined) {
      input.available = this.readBoolean(raw.available, 'available');
    }
    if (raw.options !== undefined) {
      input.options = this.readOptionalOptions(raw.options) ?? [];
    }

    if (Object.keys(input).length === 0) {
      throw new BadRequestException('Aucun champ à mettre à jour');
    }

    return input;
  }

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} requis (string non vide)`);
    }
    return value.trim();
  }

  private readPrice(value: unknown): number {
    const price = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('price doit être un nombre ≥ 0');
    }
    return price;
  }

  private readBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} doit être un boolean`);
    }
    return value;
  }

  private readOptionalDescription(value: unknown): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('description doit être une string ou null');
    }
    return value;
  }

  private readOptionalOptions(
    value: unknown,
  ): ReturnType<MenuService['normalizeOptions']> | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        'options doit être un tableau [{ name, required?, price? }]',
      );
    }

    for (const entry of value) {
      if (typeof entry === 'string') {
        continue;
      }
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException(
          'chaque option doit être une string ou { name, required?, price? }',
        );
      }
      const raw = entry as Record<string, unknown>;
      if (typeof raw.name !== 'string' || !raw.name.trim()) {
        throw new BadRequestException('option.name requis (string non vide)');
      }
    if (raw.required !== undefined && typeof raw.required !== 'boolean') {
      throw new BadRequestException('option.required doit être un boolean');
    }
    if (raw.choices !== undefined) {
      if (!Array.isArray(raw.choices)) {
        throw new BadRequestException('option.choices doit être un tableau');
      }
      for (const choice of raw.choices) {
        if (typeof choice === 'string') {
          if (!choice.trim()) {
            throw new BadRequestException(
              'option.choices ne doit contenir que des libellés non vides',
            );
          }
          continue;
        }
        if (!choice || typeof choice !== 'object') {
          throw new BadRequestException(
            'option.choices doit être string[] ou { name, price? }[]',
          );
        }
        const choiceRaw = choice as Record<string, unknown>;
        if (typeof choiceRaw.name !== 'string' || !choiceRaw.name.trim()) {
          throw new BadRequestException(
            'choice.name requis (string non vide)',
          );
        }
        if (choiceRaw.price !== undefined) {
          const choicePrice =
            typeof choiceRaw.price === 'number'
              ? choiceRaw.price
              : Number(choiceRaw.price);
          if (!Number.isFinite(choicePrice) || choicePrice < 0) {
            throw new BadRequestException(
              'choice.price doit être un nombre ≥ 0',
            );
          }
        }
      }
    }
    if (raw.price !== undefined) {
        const price =
          typeof raw.price === 'number' ? raw.price : Number(raw.price);
        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException('option.price doit être un nombre ≥ 0');
        }
      }
    }

    return this.menuService.normalizeOptions(value);
  }
}
